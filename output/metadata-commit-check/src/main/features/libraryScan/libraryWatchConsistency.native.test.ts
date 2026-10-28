import { createRequire } from 'node:module'
import {
  mkdtemp,
  mkdir,
  rm,
  stat,
  readFile,
  writeFile,
  utimes,
  rename,
  copyFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type Database from 'better-sqlite3'
import { afterEach, expect, it, vi } from 'vitest'
import { migrateDatabase } from '../../database/schema'
import { TrackRepository } from '../../repositories/trackRepository'
import { LibraryRootRepository } from '../../repositories/libraryRootRepository'
import { LibraryScanTrackReader } from '../../features/libraryScan/libraryScanTrackReader'
import { LibraryScanArtwork } from '../../features/libraryScan/libraryScanArtwork'
import { LibraryIncrementalImportService } from '../../features/libraryScan/libraryIncrementalImportService'
import { MetadataWatchService } from '../../features/metadata/metadataWatchService'
import type { MetadataRefreshService } from '../../features/metadata/metadataRefreshService'
import { parseAudioMetadata } from '../../features/metadata/parseAudioMetadata'
import { resolveChangedFilePaths } from '../metadata/metadataFileChangeFilter'
import { scanFileFingerprint } from './libraryScanFileFingerprint'
import { getMetadataParserVersion } from '../metadata/metadataParserVersion'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, stat: vi.fn(actual.stat) }
})

const DB = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
const ffmpegPath = resolve('resources/audio/ffmpeg.exe')
const fixtures: { dir: string; db: Database.Database; watcher?: MetadataWatchService }[] = []
const fixedTime = new Date('2026-10-01T00:00:00.000Z')
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'auralis-watch-incremental-audit-'))
  const root = join(dir, 'library')
  await mkdir(root)
  const db = new DB(':memory:')
  migrateDatabase(db)
  const owned = { dir, db, watcher: undefined as MetadataWatchService | undefined }
  fixtures.push(owned)
  const tracks = new TrackRepository(db)
  const roots = new LibraryRootRepository(db)
  roots.upsertByPath(root)
  const reader = new LibraryScanTrackReader(
    [],
    new LibraryScanArtwork(join(dir, 'artwork')),
    (_p, reason) => {
      throw new Error(reason)
    },
  )
  const makeTrack = async (name: string, title: string) => {
    const path = join(root, name)
    await promisify(execFile)(
      ffmpegPath,
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=duration=0.2',
        '-c:a',
        'flac',
        '-metadata',
        `title=${title}`,
        '-metadata',
        'artist=Artist',
        '-metadata',
        'album=Album',
        path,
      ],
      { windowsHide: true },
    )
    await utimes(path, fixedTime, fixedTime)
    const parsed = await reader.read(path)
    if (parsed.kind !== 'track') throw new Error('Expected valid FLAC')
    tracks.upsertMany([parsed.track])
    const id = tracks.getTrackIdsByFilePaths([path])[0]!
    return { path, id }
  }
  return { dir, root, db, tracks, roots, makeTrack, owned }
}

afterEach(async () => {
  for (const f of fixtures.splice(0)) {
    await f.watcher?.stop()
    f.db.close()
    if (
      !resolve(f.dir).startsWith(resolve(tmpdir()) + sep) ||
      !f.dir.includes('auralis-watch-incremental-audit-')
    )
      throw new Error('Unsafe cleanup')
    await rm(f.dir, { recursive: true, force: true })
  }
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  vi.mocked(stat).mockReset().mockImplementation(actual.stat)
  vi.restoreAllMocks()
})

it.each([false, true])(
  'observes a real title change through fs.watch (preserve mtime: %s)',
  async (preserveMtime) => {
    const f = await fixture()
    const original = await f.makeTrack('song.flac', 'Original')
    const before = await stat(original.path)
    const refresh = vi.fn()
    const imported = vi.fn()
    const fingerprints = vi.spyOn(f.tracks, 'getFileFingerprintsByFilePaths')
    const watcher = new MetadataWatchService(
      f.roots,
      f.tracks,
      { refreshTracksFromFileChanges: refresh } as unknown as MetadataRefreshService,
      { importFiles: imported } as unknown as LibraryIncrementalImportService,
      () => {},
    )
    f.owned.watcher = watcher
    watcher.start()
    const bytes = await readFile(original.path)
    const titleOffset = bytes.indexOf(Buffer.from('Original'))
    expect(titleOffset).toBeGreaterThan(-1)
    Buffer.from('Modified').copy(bytes, titleOffset)
    await writeFile(original.path, bytes)
    if (preserveMtime) await utimes(original.path, before.atime, before.mtime)
    const after = await stat(original.path)
    expect(after.size).toBe(before.size)
    if (preserveMtime) expect(after.mtimeMs).toBe(before.mtimeMs)
    expect(after.ctimeMs).not.toBe(before.ctimeMs)
    expect((await parseAudioMetadata(original.path)).common.title).toBe('Modified')
    if (preserveMtime) {
      const reader = new LibraryScanTrackReader(
        f.tracks.getKnownFiles(),
        new LibraryScanArtwork(join(f.dir, 'rescan-artwork')),
        (_path, reason) => {
          throw new Error(reason)
        },
      )
      const rescanned = await reader.read(original.path)
      expect(rescanned.kind).toBe('track')
      if (rescanned.kind === 'track') expect(rescanned.track.title).toBe('Modified')
    }
    await vi.waitFor(() => expect(fingerprints).toHaveBeenCalled(), { timeout: 6000 })
    await watcher.pauseFlush()
    expect(imported).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledWith([original.id])
  },
  10000,
)

it.each([false, true])(
  'rechecks an old path restored while another candidate stat waits (restore: %s)',
  async (restore) => {
    const f = await fixture()
    const first = await f.makeTrack('old-a.flac', 'First song')
    const second = await f.makeTrack('old-b.flac', 'Second song')
    f.db.prepare("INSERT INTO playlists(id,name) VALUES(1,'Favorites')").run()
    f.db
      .prepare('INSERT INTO playlist_tracks(playlist_id,track_id,position) VALUES(1,?,0)')
      .run(first.id)
    f.db.prepare('INSERT INTO track_play_stats(track_id,play_count) VALUES(?,7)').run(first.id)
    const newA = join(f.root, 'new-a.flac'),
      newB = join(f.root, 'new-b.flac')
    await rename(first.path, newA)
    await rename(second.path, newB)
    const waiting = deferred(),
      resume = deferred()
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.mocked(stat).mockImplementation(async (...args: Parameters<typeof stat>) => {
      if (String(args[0]) === second.path) {
        waiting.resolve()
        await resume.promise
      }
      return actual.stat(...args)
    })
    const send = vi.fn()
    const service = new LibraryIncrementalImportService(f.tracks, join(f.dir, 'artwork'), send)
    const pending = service.importFiles([newA, newB])
    try {
      await waiting.promise
      if (restore) {
        await copyFile(newA, first.path)
        expect((await parseAudioMetadata(first.path)).common.title).toBe('First song')
      }
    } finally {
      resume.resolve()
    }
    const result = await pending
    expect(result.failed).toEqual([])
    expect(result.unstable).toEqual([])
    expect(f.tracks.getFilePathById(second.id)).toBe(newB)
    expect(f.tracks.getFilePathById(first.id)).toBe(restore ? first.path : newA)
    expect(
      f.db
        .prepare(
          'SELECT t.file_path AS path, s.play_count AS count FROM playlist_tracks p JOIN tracks t ON t.id=p.track_id JOIN track_play_stats s ON s.track_id=t.id WHERE p.playlist_id=1',
        )
        .get(),
    ).toEqual({ path: restore ? first.path : newA, count: 7 })
    if (restore) expect(f.tracks.getTrackIdsByFilePaths([newA])[0]).not.toBe(first.id)
  },
  10000,
)

it.each([
  [null, false],
  ['[100,200]', false],
  [null, true],
  ['[100,200]', true],
] as const)(
  'fully rereads unknown file fingerprints before establishing a baseline (stored: %s, parser current: %s)',
  async (legacyFingerprint, parserCurrent) => {
    const f = await fixture()
    const original = await f.makeTrack('song.flac', 'Original')
    const replacement = join(f.dir, 'replacement.flac')
    await promisify(execFile)(
      ffmpegPath,
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=duration=3',
        '-c:a',
        'flac',
        '-metadata',
        'title=Modified',
        '-metadata',
        'artist=Artist',
        '-metadata',
        'album=Album',
        replacement,
      ],
      { windowsHide: true },
    )
    const oldBytes = await readFile(original.path),
      newBytes = await readFile(replacement)
    const size = Math.max(oldBytes.length, newBytes.length)
    const pad = (bytes: Buffer) => Buffer.concat([bytes, Buffer.alloc(size - bytes.length)])
    await writeFile(original.path, pad(oldBytes))
    await utimes(original.path, fixedTime, fixedTime)
    const initial = await new LibraryScanTrackReader(
      [],
      new LibraryScanArtwork(join(f.dir, 'initial-artwork')),
      (_path, reason) => {
        throw new Error(reason)
      },
    ).read(original.path)
    if (initial.kind !== 'track') throw new Error('Expected initial full track')
    f.tracks.upsertMany([initial.track])
    const before = f.tracks.getAll()[0]
    f.db
      .prepare('UPDATE tracks SET file_stat_fingerprint=?,metadata_parser_version=? WHERE id=?')
      .run(
        legacyFingerprint,
        parserCurrent ? getMetadataParserVersion(original.path) : '',
        original.id,
      )
    await writeFile(original.path, pad(newBytes))
    await utimes(original.path, fixedTime, fixedTime)
    const actual = await parseAudioMetadata(original.path, { duration: true })
    expect(actual.format.duration! - before.durationSeconds!).toBeGreaterThan(1)
    expect((await stat(original.path)).size).toBe(initial.track.fileSize)
    expect((await stat(original.path)).mtimeMs).toBe(initial.track.fileMtimeMs)
    const read = await new LibraryScanTrackReader(
      f.tracks.getKnownFiles(),
      new LibraryScanArtwork(join(f.dir, 'backfill-artwork')),
      (_path, reason) => {
        throw new Error(reason)
      },
    ).read(original.path)
    if (read.kind === 'tags') f.tracks.patchTrackTags([read.patch])
    else if (read.kind === 'track') f.tracks.upsertMany([read.track])
    else throw new Error('Expected metadata read')
    const persisted = f.tracks.getAll()[0]
    const changed = resolveChangedFilePaths({
      stats: [{ filePath: original.path, ...scanFileFingerprint(await stat(original.path)) }],
      fingerprints: f.tracks.getFileFingerprintsByFilePaths([original.path]),
    })
    expect(persisted.title).toBe('Modified')
    expect({ duration: persisted.durationSeconds, scheduledRefresh: changed }).toEqual({
      duration: actual.format.duration,
      scheduledRefresh: [],
    })
  },
)
