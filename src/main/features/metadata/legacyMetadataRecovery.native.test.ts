import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import type { EventEmitter } from 'node:events'
import type Database from 'better-sqlite3'
import sharp from 'sharp'
import { afterEach, expect, it, vi } from 'vitest'
import { migrateDatabase } from '@main/database/schema'
import { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import { TrackRepository } from '@main/repositories/trackRepository'
import { MetadataRefreshRepository } from '@main/repositories/metadataRefreshRepository'
import { LibraryScanArtwork } from '../libraryScan/libraryScanArtwork'
import { LibraryScanTrackReader } from '../libraryScan/libraryScanTrackReader'
import type { LibraryIncrementalImportService } from '../libraryScan/libraryIncrementalImportService'
import { MetadataRefreshService } from './metadataRefreshService'
import { MetadataWatchService } from './metadataWatchService'
import { readStableMetadata } from './readStableMetadata'
import type {
  MetadataRefreshWorkerInput,
  MetadataRefreshWorkerResult,
} from './metadataRefreshTypes'

// Only message delivery is controlled. Parsing, fingerprints, SQLite transactions,
// projection and the watcher used by startup all run their production code.
const workers = vi.hoisted(() => [] as Array<EventEmitter & { input: MetadataRefreshWorkerInput }>)
vi.mock('node:worker_threads', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    Worker: class extends EventEmitter {
      input: MetadataRefreshWorkerInput
      terminate = vi.fn(async () => 0)
      constructor(_path: string, options: { workerData: MetadataRefreshWorkerInput }) {
        super()
        this.input = options.workerData
        workers.push(this)
      }
    },
  }
})

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
const ffmpeg = fileURLToPath(new URL('../../../../resources/audio/ffmpeg.exe', import.meta.url))
const fixtures: Array<{
  directory: string
  db: Database.Database
  service: MetadataRefreshService
  watcher?: MetadataWatchService
}> = []

async function fixture(emptyTags = false, format: 'flac' | 'm4a' = 'flac') {
  const directory = await mkdtemp(join(tmpdir(), 'auralis-legacy-readback-'))
  const filePath = join(directory, `source.${format}`)
  const cache = join(directory, 'cache')
  const sidecar = join(directory, 'source.lrc')
  await promisify(execFile)(
    ffmpeg,
    [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=duration=0.1',
      '-c:a',
      format === 'm4a' ? 'aac' : 'flac',
      ...(emptyTags
        ? []
        : [
            '-metadata',
            'title=File title',
            '-metadata',
            'artist=File artist',
            '-metadata',
            'album=File album',
          ]),
      filePath,
    ],
    { windowsHide: true },
  )
  await writeFile(sidecar, '[00:00.01]繁體歌詞\n')
  const db = new DatabaseCtor(':memory:')
  migrateDatabase(db)
  const roots = new LibraryRootRepository(db)
  roots.upsertByPath(directory)
  const tracks = new TrackRepository(db)
  const repo = new MetadataRefreshRepository(db)
  db.prepare('INSERT INTO tracks(id,file_path) VALUES(1,?)').run(filePath)
  repo.updateTrackMetadata(await readStableMetadata(1, filePath, cache))
  db.prepare(
    `UPDATE track_metadata SET title='Old title', artist_display='Old artist',
    album_title='Old album', album_artist_display='Old artist', genre_display=NULL,
    source='legacy_user_edit', override_mask=127 WHERE track_id=1`,
  ).run()
  const changed = vi.fn()
  const service = new MetadataRefreshService(repo, cache, {
    libraryChanged: changed,
    refreshProgress: vi.fn(),
  })
  const owned = { directory, db, service, watcher: undefined as MetadataWatchService | undefined }
  fixtures.push(owned)
  const source = () =>
    db.prepare('SELECT source,override_mask FROM track_metadata WHERE track_id=1').get()
  const display = () =>
    db.prepare('SELECT title,artist,album,genre FROM library_track_display WHERE id=1').get()
  async function finish(jobId: number, result?: MetadataRefreshWorkerResult) {
    const worker = workers.at(-1)!
    if (result) worker.emit('message', { type: 'result', payload: result })
    else {
      try {
        const parsed = await readStableMetadata(1, filePath, cache)
        worker.emit('message', { type: 'result', payload: { ...parsed, jobId } })
      } catch (error) {
        worker.emit('message', {
          type: 'failure',
          payload: { jobId, trackId: 1, filePath, reason: String(error) },
        })
      }
    }
    worker.emit('message', { type: 'complete' })
    await vi.waitFor(() => expect(service.hasActiveJob()).toBe(false))
  }
  return {
    directory,
    db,
    roots,
    tracks,
    repo,
    service,
    filePath,
    cache,
    sidecar,
    owned,
    source,
    display,
    changed,
    finish,
  }
}

afterEach(async () => {
  vi.restoreAllMocks()
  for (const f of fixtures.splice(0)) {
    await f.watcher?.stop()
    await f.service.shutdown()
    f.db.close()
    expect(relative(tmpdir(), f.directory)).toMatch(/^auralis-legacy-readback-[^\\/]+$/)
    await rm(f.directory, { recursive: true, force: true })
  }
  workers.length = 0
})

it('queues only historical overrides and forces an unchanged file through startup watcher recovery', async () => {
  const f = await fixture()
  const audio = await readFile(f.filePath),
    lyrics = await readFile(f.sidecar)
  f.db
    .prepare(
      `INSERT INTO tracks(id,file_path,metadata_checked_mtime_ms,lyrics_checked_mtime_ms)
    VALUES(2,?,123,456)`,
    )
    .run(join(f.directory, 'unrelated.flac'))
  const before = f.db
    .prepare('SELECT lyrics_checked_mtime_ms,file_stat_fingerprint FROM tracks WHERE id=1')
    .get()
  f.repo.queueLegacyMetadataRecovery()
  f.repo.queueLegacyMetadataRecovery()
  expect(f.repo.listPendingTagRecoveryPaths()).toEqual([f.filePath])
  expect(
    f.db.prepare('SELECT metadata_checked_mtime_ms FROM tracks WHERE id=1').pluck().get(),
  ).toBeNull()
  expect(
    f.db.prepare('SELECT metadata_checked_mtime_ms FROM tracks WHERE id=2').pluck().get(),
  ).toBe(123)
  expect(
    f.db
      .prepare('SELECT lyrics_checked_mtime_ms,file_stat_fingerprint FROM tracks WHERE id=1')
      .get(),
  ).toEqual(before)
  const watcher = new MetadataWatchService(
    f.roots,
    f.tracks,
    f.service,
    { importFiles: vi.fn() } as unknown as LibraryIncrementalImportService,
    f.changed,
  )
  f.owned.watcher = watcher
  watcher.start()
  watcher.enqueueRestoredPaths(f.repo.listPendingTagRecoveryPaths())
  await vi.waitFor(() => expect(workers.length).toBe(1), { timeout: 4000 })
  expect(workers[0].input).toMatchObject({
    writeMode: 'metadata',
    tracks: [{ trackId: 1, filePath: f.filePath }],
  })
  await watcher.pauseFlush()
  await f.finish(workers[0].input.jobId)
  expect(f.source()).toEqual({ source: 'file_tag', override_mask: 0 })
  expect(f.display()).toMatchObject({
    title: 'File title',
    artist: 'File artist',
    album: 'File album',
    genre: null,
  })
  expect(f.repo.listPendingTagRecoveryPaths()).toEqual([])
  expect(
    f.db
      .prepare(
        `SELECT a.name FROM track_artists ta JOIN artists a ON a.id=ta.artist_id
    WHERE ta.track_id=1 AND ta.role='primary'`,
      )
      .all(),
  ).toEqual([{ name: 'File artist' }])
  expect(f.db.prepare('SELECT effective_album_title FROM tracks WHERE id=1').pluck().get()).toBe(
    'File album',
  )
  expect(await readFile(f.filePath)).toEqual(audio)
  expect(await readFile(f.sidecar)).toEqual(lyrics)
})

it('adopts explicit missing file tags without filling them from the historical display', async () => {
  const f = await fixture(true)
  f.repo.queueLegacyMetadataRecovery()
  await f.finish(f.service.refreshTrack(1).jobId)
  expect(f.source()).toEqual({ source: 'file_tag', override_mask: 0 })
  expect(
    f.db
      .prepare(
        'SELECT title,artist,album,album_artist,genre,year,release_date FROM tracks WHERE id=1',
      )
      .get(),
  ).toEqual({
    title: null,
    artist: null,
    album: null,
    album_artist: null,
    genre: null,
    year: null,
    release_date: null,
  })
  expect(f.db.prepare('SELECT COUNT(*) FROM track_artists WHERE track_id=1').pluck().get()).toBe(0)
  expect(f.repo.listPendingTagRecoveryPaths()).toEqual([])
})

it.each(['offline', 'parse failure'] as const)(
  'keeps the historical display and pending recovery after %s, and retries later',
  async (failure) => {
    const f = await fixture()
    const original = await readFile(f.filePath)
    const before = f.display()
    f.repo.queueLegacyMetadataRecovery()
    const { jobId } = f.service.refreshTrack(1)
    if (failure === 'offline') await rename(f.filePath, f.filePath + '.offline')
    else await writeFile(f.filePath, 'Invalid music file')
    await f.finish(jobId)
    expect(f.repo.getJobById(jobId)?.failedTracks).toBe(1)
    expect(f.display()).toEqual(before)
    expect(f.source()).toEqual({ source: 'legacy_user_edit', override_mask: 127 })
    expect(new MetadataRefreshRepository(f.db).listPendingTagRecoveryPaths()).toEqual([f.filePath])
    expect(
      f.db.prepare('SELECT metadata_checked_mtime_ms FROM tracks WHERE id=1').pluck().get(),
    ).toBeNull()
    if (failure === 'offline') await rename(f.filePath + '.offline', f.filePath)
    else await writeFile(f.filePath, original)
    f.tracks.markAvailableByFilePaths([f.filePath])
    await f.finish(f.service.refreshTrack(1).jobId)
    expect(f.display()).toMatchObject({ title: 'File title' })
    expect(f.repo.listPendingTagRecoveryPaths()).toEqual([])
    expect(await readFile(f.filePath)).toEqual(original)
  },
)

it('rejects an obsolete full read without releasing overrides, then accepts a fresh read', async () => {
  const f = await fixture()
  f.repo.queueLegacyMetadataRecovery()
  const { jobId } = f.service.refreshTrack(1)
  const parsed = await readStableMetadata(1, f.filePath, f.cache)
  const bytes = await readFile(f.filePath)
  const index = bytes.indexOf(Buffer.from('File title'))
  expect(index).toBeGreaterThan(0)
  Buffer.from('Next title').copy(bytes, index)
  const replacement = f.filePath + '.replacement'
  await writeFile(replacement, bytes)
  await rename(replacement, f.filePath)
  await f.finish(jobId, { ...parsed, jobId })
  expect(f.repo.getJobById(jobId)?.failedTracks).toBe(1)
  expect(f.display()).toMatchObject({ title: 'Old title' })
  expect(f.repo.listPendingTagRecoveryPaths()).toEqual([f.filePath])
  await f.finish(f.service.refreshTrack(1).jobId)
  expect(f.display()).toMatchObject({ title: 'Next title' })
  expect(f.repo.listPendingTagRecoveryPaths()).toEqual([])
})

it('leaves overrides pending on lyrics-only and artwork-only updates, then retries via scan', async () => {
  const f = await fixture()
  f.repo.queueLegacyMetadataRecovery()
  f.repo.updateTrackLyrics(await readStableMetadata(1, f.filePath, f.cache))
  f.tracks.patchAlbumArtwork([
    {
      filePath: f.filePath,
      album: 'File album',
      artist: 'File artist',
      artworkCacheKey: null,
      artworkRead: { status: 'absent' },
    },
  ])
  expect(f.source()).toEqual({ source: 'legacy_user_edit', override_mask: 127 })
  expect(f.repo.listPendingTagRecoveryPaths()).toEqual([f.filePath])
  const parsed = await new LibraryScanTrackReader(
    f.tracks.getKnownFiles(),
    new LibraryScanArtwork(f.cache),
    () => {},
  ).read(f.filePath)
  expect(parsed.kind).toBe('track')
  if (parsed.kind === 'track') f.tracks.upsertMany([parsed.track])
  else if (parsed.kind === 'tags') f.tracks.patchTrackTags([parsed.patch])
  expect(f.source()).toEqual({ source: 'file_tag', override_mask: 0 })
  expect(f.repo.listPendingTagRecoveryPaths()).toEqual([])
})

it('rolls back override release and queue removal when artist projection fails', async () => {
  const f = await fixture()
  f.repo.queueLegacyMetadataRecovery()
  const before = f.display()
  f.db.exec(`CREATE TRIGGER reject_recovered_artist BEFORE INSERT ON track_artists
    BEGIN SELECT RAISE(ABORT, 'projection failure'); END`)
  await f.finish(f.service.refreshTrack(1).jobId)
  expect(f.display()).toEqual(before)
  expect(f.source()).toEqual({ source: 'legacy_user_edit', override_mask: 127 })
  expect(f.repo.listPendingTagRecoveryPaths()).toEqual([f.filePath])
  f.db.exec('DROP TRIGGER reject_recovered_artist')
  await f.finish(f.service.refreshTrack(1).jobId)
  expect(f.repo.listPendingTagRecoveryPaths()).toEqual([])
})

it('refreshes covers after adoption and preserves the last usable cache if the cover cannot be decoded', async () => {
  const f = await fixture()
  const cover = join(f.directory, 'cover.jpg')
  await sharp({ create: { width: 12, height: 12, channels: 3, background: '#ba4242' } })
    .jpeg()
    .toFile(cover)
  f.repo.queueLegacyMetadataRecovery()
  await f.finish(f.service.refreshTrack(1).jobId)
  const key = () =>
    f.db.prepare('SELECT artwork_cache_key FROM library_track_display WHERE id=1').pluck().get()
  const first = key()
  expect(first).toMatch(/^v2-/)
  const music = await readFile(f.filePath),
    lyrics = await readFile(f.sidecar),
    fingerprint = await stat(f.filePath)
  await writeFile(cover, 'undecodable cover')
  await f.finish(f.service.refreshTrack(1).jobId)
  expect(key()).toBe(first)
  await sharp({ create: { width: 12, height: 12, channels: 3, background: '#4284ba' } })
    .jpeg()
    .toFile(cover)
  await f.finish(f.service.refreshTrack(1).jobId)
  expect(key()).not.toBe(first)
  expect(await readFile(f.filePath)).toEqual(music)
  expect(await readFile(f.sidecar)).toEqual(lyrics)
  expect((await stat(f.filePath)).mtimeMs).toBe(fingerprint.mtimeMs)
})

it.each(['flac', 'm4a'] as const)(
  'uses a complete read for an unchanged %s recovery, including when scan wins the startup race',
  async (format) => {
    const f = await fixture(false, format)
    const audio = await readFile(f.filePath)
    const lyrics = await readFile(f.sidecar)
    // A stale technical value proves that text-only backfill cannot satisfy recovery.
    f.db.prepare('UPDATE tracks SET duration_seconds=999 WHERE id=1').run()
    f.repo.queueLegacyMetadataRecovery()
    const known = f.tracks.getKnownFiles()
    expect(known[0].requiresFullMetadataRead).toBe(true)
    expect(known[0].fileFingerprint).toBeTruthy()
    const failure = vi.fn()
    const parsed = await new LibraryScanTrackReader(
      known,
      new LibraryScanArtwork(f.cache),
      failure,
    ).read(f.filePath)
    expect(failure).not.toHaveBeenCalled()
    expect(parsed.kind).toBe('track')
    if (parsed.kind !== 'track') throw new Error('Expected complete recovery read')
    expect(parsed.track.durationSeconds).toBeGreaterThan(0)
    expect(parsed.track.durationSeconds).toBeLessThan(1)
    f.tracks.upsertMany([parsed.track])
    expect(f.source()).toEqual({ source: 'file_tag', override_mask: 0 })
    expect(f.display()).toMatchObject({ title: 'File title' })
    expect(f.repo.listPendingTagRecoveryPaths()).toEqual([])
    expect(f.tracks.getKnownFiles()[0].requiresFullMetadataRead).toBe(false)
    expect(await readFile(f.filePath)).toEqual(audio)
    expect(await readFile(f.sidecar)).toEqual(lyrics)
  },
)
