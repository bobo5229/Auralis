import { link, lstat, readdir, realpath, rm, rmdir, unlink } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { logger } from '@main/logging/logger'
import { isPathUnderAnyRoot } from '../audio/audioPathGuard'
const PENDING_LYRICS_BACKUP_MARKER = '.auralis-write-pending'
import { isLyricSidecar, resolveAudioCandidatesForLyricSidecar } from './lyricSidecarPaths'

/**
 * A hard kill between `rename(original, backup)` and `link(staging, original)`
 * leaves no file at the audio path while the backup stays behind silently.
 * This sweep restores such backups without overwriting an existing path.
 * A successful restore removes the backup; existing paths and failed restores
 * retain it so the previous content remains available.
 */
const TAG_BACKUP_FILE =
  /^(.+)\.auralis-backup-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** Lyrics backups are mkdtemp directories whose suffix is not a UUID. */
const BACKUP_DIRECTORY = /^(.+)\.auralis-backup-[^\\/:*?"<>|]+$/
const TAG_STAGING_FILE =
  /^(.+)\.auralis-replacement-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\.probe)?$/
const LYRICS_STAGING_FILE =
  /^(.+)\.auralis-lyrics-staging-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\.probe)?$/

export interface TagWriteRecoveryReport {
  /** Audio and lyric paths restored from an interrupted write. */
  restored: string[]
  /** Staging leftovers removed; the interrupted write would have discarded them. */
  removedStaging: string[]
  /** Backups kept because the public path exists or the backup looks unexpected. */
  retained: Array<{ path: string; reason: string }>
}

export function resolveTagRecoveryTrackIds(
  path: string,
  getTrackIdsByPlaybackPath: (path: string) => number[],
): number[] {
  const audioPaths = isLyricSidecar(path) ? resolveAudioCandidatesForLyricSidecar(path) : [path]
  return [...new Set(audioPaths.flatMap(getTrackIdsByPlaybackPath))]
}

type DirectoryEntry = Dirent

async function statOrNull(path: string) {
  try {
    return await lstat(path)
  } catch {
    return null
  }
}

/**
 * Publish the backup content at the original path via an exclusive hard link:
 * a concurrently created file wins with EEXIST and the backup is retained.
 * Both paths share the same directory, so linking never crosses devices.
 */
async function restoreExclusive(
  originalPath: string,
  sourcePath: string,
  beforeRestore: (path: string) => void,
): Promise<boolean> {
  if (await statOrNull(originalPath)) return false
  beforeRestore(originalPath)
  try {
    await link(sourcePath, originalPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw error
  }
  return true
}

async function restoreTagBackup(
  directory: string,
  backupName: string,
  originalName: string,
  report: TagWriteRecoveryReport,
  beforeRestore: (path: string) => void,
): Promise<void> {
  const backupPath = join(directory, backupName)
  const originalPath = join(directory, originalName)
  try {
    if (await restoreExclusive(originalPath, backupPath, beforeRestore)) {
      report.restored.push(originalPath)
      await unlink(backupPath)
      logger.warn({ originalPath, backupPath }, 'Restored audio file from tag-write backup')
    } else {
      report.retained.push({ path: backupPath, reason: 'original-exists' })
    }
  } catch (error) {
    logger.warn({ err: error, backupPath }, 'Unable to restore tag-write backup; copy retained')
    report.retained.push({ path: backupPath, reason: 'restore-failed' })
  }
}

async function restoreLyricsBackup(
  directory: string,
  backupName: string,
  originalName: string,
  report: TagWriteRecoveryReport,
  beforeRestore: (path: string) => void,
): Promise<void> {
  const backupDirectory = join(directory, backupName)
  const originalPath = join(directory, originalName)
  const backupPath = join(backupDirectory, originalName)
  const markerPath = join(backupDirectory, PENDING_LYRICS_BACKUP_MARKER)
  try {
    if (!(await statOrNull(markerPath))?.isFile()) return
    const children = await readdir(backupDirectory)
    const inner = await statOrNull(backupPath)
    if (
      children.length !== 2 ||
      !children.includes(originalName) ||
      !inner ||
      inner.isSymbolicLink() ||
      !inner.isFile()
    ) {
      report.retained.push({ path: backupDirectory, reason: 'unexpected-backup-content' })
      return
    }
    if (await restoreExclusive(originalPath, backupPath, beforeRestore)) {
      report.restored.push(originalPath)
      await unlink(markerPath)
      await unlink(backupPath)
      await rmdir(backupDirectory)
      logger.warn({ originalPath, backupDirectory }, 'Restored lyrics file from write backup')
    } else {
      await unlink(markerPath)
      report.retained.push({ path: backupDirectory, reason: 'original-exists' })
    }
  } catch (error) {
    logger.warn({ err: error, backupDirectory }, 'Unable to restore lyrics backup; copy retained')
    report.retained.push({ path: backupDirectory, reason: 'restore-failed' })
  }
}

async function removeStagingLeftover(path: string, report: TagWriteRecoveryReport): Promise<void> {
  try {
    await rm(path, { force: true })
    report.removedStaging.push(path)
  } catch (error) {
    logger.warn({ err: error, path }, 'Unable to remove tag-write staging leftover')
  }
}

async function recoverDirectory(
  directory: string,
  report: TagWriteRecoveryReport,
  beforeRestore: (path: string) => void,
): Promise<void> {
  let entries: DirectoryEntry[]
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return
  }
  // Backups first so a restored original exists before staging cleanup runs.
  for (const entry of entries) {
    const fileMatch = entry.isFile() ? TAG_BACKUP_FILE.exec(entry.name) : null
    const directoryMatch = entry.isDirectory() ? BACKUP_DIRECTORY.exec(entry.name) : null
    if (!fileMatch && !directoryMatch) continue
    const info = await statOrNull(join(directory, entry.name))
    if (!info || info.isSymbolicLink()) continue
    if (fileMatch && info.isFile()) {
      await restoreTagBackup(directory, entry.name, fileMatch[1], report, beforeRestore)
      continue
    }
    if (directoryMatch && info.isDirectory() && isLyricSidecar(directoryMatch[1])) {
      await restoreLyricsBackup(directory, entry.name, directoryMatch[1], report, beforeRestore)
    }
  }
  for (const entry of entries) {
    if (
      !entry.isFile() ||
      (!TAG_STAGING_FILE.test(entry.name) && !LYRICS_STAGING_FILE.test(entry.name))
    )
      continue
    const info = await statOrNull(join(directory, entry.name))
    if (!info || info.isSymbolicLink() || !info.isFile()) continue
    await removeStagingLeftover(join(directory, entry.name), report)
  }
}

export async function recoverTagWriteArtifacts(
  directories: string[],
  beforeRestore: (path: string) => void = () => {},
): Promise<TagWriteRecoveryReport> {
  const report: TagWriteRecoveryReport = { restored: [], removedStaging: [], retained: [] }
  for (const directory of [...new Set(directories)].sort()) {
    if (!directory) continue
    await recoverDirectory(directory, report, beforeRestore)
  }
  return report
}

/**
 * Run before accepting writes. The caller queues restored paths through the
 * watcher after its roots are registered.
 */
export async function runTagWriteRecovery(
  rootPaths: string[],
  listTrackFilePaths: (rootPath: string) => string[],
  beforeRestore: (path: string) => void,
): Promise<string[]> {
  try {
    const directories = new Map<string, string>()
    for (const rootPath of rootPaths) {
      const canonicalRoot = await realpath(rootPath).catch(() => null)
      if (!canonicalRoot) continue
      const trackDirectories = new Set(
        listTrackFilePaths(rootPath)
          .filter((filePath) => isPathUnderAnyRoot(filePath, [rootPath]))
          .map((filePath) => dirname(filePath)),
      )
      for (const directory of trackDirectories) {
        const canonical = await realpath(directory).catch(() => null)
        if (
          canonical &&
          (relative(canonicalRoot, canonical) === '' ||
            isPathUnderAnyRoot(canonical, [canonicalRoot]))
        ) {
          directories.set(canonical, directory)
        }
      }
    }
    const logicalPath = (path: string) => join(directories.get(dirname(path))!, basename(path))
    const report = await recoverTagWriteArtifacts([...directories.keys()], (path) =>
      beforeRestore(logicalPath(path)),
    )
    if (report.restored.length || report.removedStaging.length || report.retained.length) {
      logger.warn(
        {
          restored: report.restored,
          removedStaging: report.removedStaging,
          retained: report.retained,
        },
        'Tag-write recovery finished',
      )
    }
    return report.restored.map(logicalPath)
  } catch (error) {
    logger.warn({ err: error }, 'Tag-write recovery failed')
    return []
  }
}
