import { createHash, randomUUID } from 'node:crypto'
import { lstat, open, realpath, link, rename, unlink, mkdtemp, rmdir } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import type { Stats } from 'node:fs'
import { isPathUnderAnyRoot } from '../audio/audioPathGuard'
import { isSupportedAudioFile } from '../libraryScan/audioFileFilter'
import { lyricSidecarCandidates } from '../metadata/lyricSidecarPaths'
import { MAX_LYRICS_CHARACTERS } from './ttmlDocument'
import { LyricsEditorError } from './lyricsEditorError'

export interface FileIdentity {
  size: number
  mtimeMs: number
  ctimeMs: number
  ino: number
  dev: number
}
export interface LyricFile {
  path: string
  identity: FileIdentity | null
  hash: string | null
  text: string | null
}
export const pathKey = (path: string): string =>
  process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path)
const identity = (info: Stats): FileIdentity => ({
  size: info.size,
  mtimeMs: info.mtimeMs,
  ctimeMs: info.ctimeMs,
  ino: info.ino,
  dev: info.dev,
})
export const sameIdentity = (left: FileIdentity, right: FileIdentity): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

/** Resolve the DB-owned audio path and roots, rejecting symbolic-link files and escaped parents. */
export async function authorizeLyricsPath(
  filePath: string | null,
  roots: string[],
): Promise<string> {
  if (!filePath || !isSupportedAudioFile(filePath)) throw new LyricsEditorError('track-unavailable')
  let info: Stats
  try {
    info = await lstat(filePath)
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? ''))
      throw new LyricsEditorError('track-unavailable')
    throw error
  }
  if (!info.isFile() || info.isSymbolicLink()) throw new LyricsEditorError('unsupported-file')
  const canonical = await realpath(filePath)
  const canonicalRoots = (
    await Promise.all(roots.map((root) => realpath(root).catch(() => null)))
  ).filter((root): root is string => root !== null)
  if (!isPathUnderAnyRoot(canonical, canonicalRoots)) throw new LyricsEditorError('outside-library')
  return canonical
}

export async function audioIdentity(filePath: string): Promise<FileIdentity> {
  const info = await lstat(filePath)
  if (!info.isFile() || info.isSymbolicLink()) throw new LyricsEditorError('file-changed')
  return identity(info)
}

export async function readLyricFile(path: string): Promise<LyricFile> {
  let before: Stats
  try {
    before = await lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { path, identity: null, hash: null, text: null }
    throw error
  }
  if (!before.isFile() || before.isSymbolicLink() || before.size > MAX_LYRICS_CHARACTERS * 4)
    throw new LyricsEditorError('unsupported-file')
  const file = await open(path, 'r')
  try {
    if (!sameIdentity(identity(before), identity(await file.stat())))
      throw new LyricsEditorError('file-changed')
    const chunks: Buffer[] = []
    let total = 0
    for (;;) {
      const buffer = Buffer.alloc(65536)
      const { bytesRead } = await file.read(buffer, 0, buffer.length, null)
      if (!bytesRead) break
      total += bytesRead
      if (total > MAX_LYRICS_CHARACTERS * 4) throw new LyricsEditorError('unsupported-file')
      chunks.push(buffer.subarray(0, bytesRead))
    }
    if (
      !sameIdentity(identity(before), identity(await file.stat())) ||
      !sameIdentity(identity(before), identity(await lstat(path)))
    )
      throw new LyricsEditorError('file-changed')
    const bytes = Buffer.concat(chunks)
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
    } catch {
      throw new LyricsEditorError('unsupported-file')
    }
    if (text.length > MAX_LYRICS_CHARACTERS) throw new LyricsEditorError('unsupported-file')
    return {
      path,
      identity: identity(before),
      hash: createHash('sha256').update(bytes).digest('hex'),
      text,
    }
  } finally {
    await file.close()
  }
}

export async function captureLyricsFiles(filePath: string): Promise<LyricFile[]> {
  const seen = new Set<string>()
  const unique = lyricSidecarCandidates(filePath).filter((path) => {
    const key = pathKey(path)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return Promise.all(unique.map(readLyricFile))
}

export function sameLyricFiles(
  expected: LyricFile[],
  actual: LyricFile[],
  movedPath?: string,
): boolean {
  return (
    expected.length === actual.length &&
    expected.every((entry, index) => {
      const next = actual[index]
      if (pathKey(entry.path) !== pathKey(next.path)) return false
      if (movedPath && pathKey(entry.path) === pathKey(movedPath)) return next.identity === null
      return (
        entry.hash === next.hash && JSON.stringify(entry.identity) === JSON.stringify(next.identity)
      )
    })
  )
}

/**
 * Flush first; reserve a unique backup directory; publish via an exclusive hard link.
 * No replacement rename or unlink ever overwrites an external writer's target.
 * Filesystems without hard links fail the probe before touching an existing lyrics file.
 */
export async function publishLyricsFile(
  target: LyricFile,
  text: string,
  assertUnchanged: (movedPath?: string) => Promise<void>,
): Promise<{ backupPath: string | null }> {
  const staging = `${target.path}.auralis-lyrics-staging-${randomUUID()}`
  const probe = `${staging}.probe`
  let stagingOwned = false
  let probeOwned = false
  let backupDirectory: string | null = null
  let backupPath: string | null = null
  let moved = false
  let published = false
  try {
    await assertUnchanged()
    const file = await open(
      staging,
      'wx',
      target.identity ? (await lstat(target.path)).mode & 0o777 : 0o600,
    )
    stagingOwned = true
    try {
      await file.writeFile(text, 'utf8')
      await file.sync()
    } finally {
      await file.close()
    }
    // Capability probe also avoids moving the old target on FAT/exFAT or unsupported shares.
    await link(staging, probe)
    probeOwned = true
    await unlink(probe)
    probeOwned = false
    await assertUnchanged()
    if (target.identity) {
      backupDirectory = await mkdtemp(
        join(dirname(target.path), `${basename(target.path)}.auralis-backup-`),
      )
      backupPath = join(backupDirectory, basename(target.path))
      await rename(target.path, backupPath)
      moved = true
      const captured = await readLyricFile(backupPath)
      const old = target.identity
      const now = captured.identity
      // A rename may update ctime. Content, inode, device, size and mtime must match.
      if (
        !now ||
        captured.hash !== target.hash ||
        now.ino !== old.ino ||
        now.dev !== old.dev ||
        now.size !== old.size ||
        now.mtimeMs !== old.mtimeMs
      )
        throw new LyricsEditorError('file-changed')
      await assertUnchanged(target.path)
    }
    await link(staging, target.path) // EEXIST preserves a target created by an external writer.
    published = true
    return { backupPath }
  } catch (error) {
    if (moved && !published && backupPath) {
      try {
        await link(backupPath, target.path)
      } catch {
        throw new LyricsEditorError('recovery-required', backupPath)
      }
      // Keep the recovery copy even when restoration succeeded.
    }
    if (error instanceof LyricsEditorError) throw error
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      throw new LyricsEditorError('file-changed')
    throw new LyricsEditorError('save-failed')
  } finally {
    // Cleanup failures after publication must not turn a committed save into a reported failure.
    if (probeOwned) await unlink(probe).catch(() => undefined)
    if (stagingOwned) await unlink(staging).catch(() => undefined)
    if (backupDirectory && !moved) await rmdir(backupDirectory).catch(() => undefined)
  }
}
