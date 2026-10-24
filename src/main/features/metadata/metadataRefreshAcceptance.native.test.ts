import { createRequire } from 'node:module'
import type { EventEmitter } from 'node:events'
import type { WorkerOptions } from 'node:worker_threads'
import type Database from 'better-sqlite3'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  renameSync,
  readFileSync,
  writeFileSync,
  utimesSync,
  statSync,
  rmSync,
} from 'node:fs'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { createMetadataRefreshEvents } from '@main/ipc/metadataRefreshEvents'
import { migrateDatabase } from '@main/database/schema'
import { TrackRepository } from '@main/repositories/trackRepository'
import { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import { ScanJobRepository } from '@main/repositories/scanJobRepository'
import { MetadataRefreshRepository } from '@main/repositories/metadataRefreshRepository'
import { MetadataRefreshService } from './metadataRefreshService'
import { readStableMetadata } from './readStableMetadata'
import type { MetadataRefreshWorkerMessage } from './metadataRefreshTypes'
import { LibraryScanTrackReader } from '../libraryScan/libraryScanTrackReader'
import { LibraryScanArtwork } from '../libraryScan/libraryScanArtwork'
import { LibraryScanPersistence } from '../libraryScan/libraryScanPersistence'
import { runLibraryScan } from '../libraryScan/libraryScanRun'
import type { LibraryScanWorkerMessage } from '../libraryScan/libraryScanTypes'

const workers = vi.hoisted(() => [] as EventEmitter[])
vi.mock('node:worker_threads', async (importOriginal) => {
  const { EventEmitter } = await import('node:events')
  const actual = await importOriginal<typeof import('node:worker_threads')>()
  return {
    ...actual,
    Worker: class extends EventEmitter {
      terminate: () => Promise<number> = vi.fn(async () => 0)
      constructor(file: string | URL, options?: WorkerOptions) {
        super()
        // Keep the actual tag writer workers; only hold refresh message delivery.
        if (options?.eval) return new actual.Worker(file, options)
        workers.push(this)
      }
    },
  }
})

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
const ffmpeg = fileURLToPath(new URL('../../../../resources/audio/ffmpeg.exe', import.meta.url))
const fixtures: { directory: string; db: Database.Database; service?: MetadataRefreshService }[] =
  []

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'auralis-metadata-acceptance-'))
  const db = new DatabaseCtor(':memory:')
  const owned = { directory, db, service: undefined as MetadataRefreshService | undefined }
  fixtures.push(owned)
  const root = join(directory, 'library')
  mkdirSync(root)
  const source = join(root, 'source.flac')
  const cache = join(directory, 'artwork')
  await promisify(execFile)(
    ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=1',
      '-c:a',
      'flac',
      '-metadata',
      'title=Current1',
      '-metadata',
      'artist=Artist',
      '-metadata',
      'album=Album',
      '-metadata',
      'lyrics=Old line',
      source,
    ],
    { windowsHide: true },
  )
  utimesSync(source, 1_600_000_000, 1_600_000_000)
  const parsed = await new LibraryScanTrackReader(
    [],
    new LibraryScanArtwork(cache),
    (path, reason) => {
      throw new Error(`${path}: ${reason}`)
    },
  ).read(source)
  if (parsed.kind !== 'track') throw new Error('Expected real FLAC result')
  expect(parsed.track.lyricsText).toBe('Old line')
  migrateDatabase(db)
  const tracks = new TrackRepository(db)
  tracks.upsertMany([parsed.track])
  const id = tracks.getTrackIdsByFilePaths([source])[0]
  db.prepare('INSERT INTO track_play_stats(track_id,play_count) VALUES(?,7)').run(id)
  const repo = new MetadataRefreshRepository(db)
  const send = vi.fn()
  const service = new MetadataRefreshService(repo, cache, createMetadataRefreshEvents(send), ffmpeg)
  owned.service = service
  return { directory, root, source, cache, db, tracks, id, repo, send, service }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

function emitRefreshMessage(message: MetadataRefreshWorkerMessage): void {
  const worker = workers.at(-1)
  if (!worker) throw new Error('Expected a refresh worker')
  worker.emit('message', message)
}

async function completeRefresh(f: Fixture, jobId: number): Promise<void> {
  emitRefreshMessage({ type: 'complete' })
  await vi.waitFor(() => expect(f.repo.getJobById(jobId)?.status).toBe('completed'))
}

async function holdScan(
  f: Fixture,
  mode: 'lyrics' | 'tags' | 'track',
  previousPersistence?: LibraryScanPersistence,
) {
  if (mode === 'lyrics') f.db.exec('UPDATE tracks SET lyrics_sidecar_fingerprint=NULL')
  if (mode === 'tags')
    f.db.exec("UPDATE tracks SET metadata_parser_version='', lyrics_sidecar_fingerprint=NULL")
  if (mode === 'track') f.db.exec('UPDATE tracks SET file_mtime_ms=0')
  const roots = new LibraryRootRepository(f.db)
  const jobs = new ScanJobRepository(f.db)
  const root = roots.upsertByPath(f.root)
  const job = jobs.create(root.id)
  const persistence =
    previousPersistence ?? new LibraryScanPersistence(f.db, roots, jobs, f.tracks, f.send)
  persistence.begin()
  const messages: LibraryScanWorkerMessage[] = []
  // The inventory, reader, parser, reporter, persistence and database are real.
  await runLibraryScan(
    {
      jobId: job.jobId,
      rootPath: f.root,
      knownFiles: f.tracks.getKnownFiles(),
      artworkCacheDir: f.cache,
    },
    (message) => messages.push(message),
  )
  return {
    persistence,
    jobs,
    job,
    messages,
    deliver: () => {
      for (const message of messages) persistence.handleMessage(message, job.jobId)
    },
  }
}

afterEach(async () => {
  for (const { service, db, directory } of fixtures.splice(0)) {
    await service?.shutdown()
    db.close()
    expect(relative(tmpdir(), directory)).toMatch(/^auralis-metadata-acceptance-[^\\/]+$/)
    rmSync(directory, { recursive: true, force: true })
  }
  workers.length = 0
})

it.each(['atomic', 'in-place'] as const)(
  'rejects a stale refresh after same-size/same-mtime replacement: %s',
  async (method) => {
    const f = await fixture()
    f.db.exec("UPDATE tracks SET title='Cached before refresh'")
    const { jobId } = f.service.refreshTrack(f.id)
    const result = await readStableMetadata(f.id, f.source, f.cache)
    const before = statSync(f.source)
    const bytes = readFileSync(f.source)
    const index = bytes.indexOf(Buffer.from('Current1'))
    expect(index).toBeGreaterThan(0)
    Buffer.from('Current2').copy(bytes, index)
    if (method === 'atomic') {
      const replacement = join(f.directory, 'replacement.flac')
      writeFileSync(replacement, bytes)
      utimesSync(replacement, 1_600_000_000, 1_600_000_000)
      renameSync(replacement, f.source)
    } else {
      writeFileSync(f.source, bytes)
      utimesSync(f.source, 1_600_000_000, 1_600_000_000)
    }
    const after = statSync(f.source)
    expect(after.size).toBe(before.size)
    expect(after.mtimeMs).toBe(before.mtimeMs)
    expect(method === 'atomic' ? after.ino !== before.ino : after.ctimeMs !== before.ctimeMs).toBe(
      true,
    )
    expect((await readStableMetadata(f.id, f.source, f.cache)).title).toBe('Current2')
    workers
      .at(-1)!
      .emit('message', { type: 'result', payload: { ...result, jobId, generation: 0 } })
    await completeRefresh(f, jobId)
    expect(f.repo.getJobById(jobId)?.failedTracks).toBe(1)
    expect(f.tracks.getAll()[0].title).toBe('Cached before refresh')
    expect(f.repo.listFailures()).toMatchObject([
      { trackId: f.id, reason: 'Audio file changed while metadata was being read' },
    ])
    expect(f.send).not.toHaveBeenCalledWith('library:changed', expect.anything())
  },
)

it.each(['returned', 'still missing'] as const)(
  'rechecks a worker ENOENT before marking a track missing: %s',
  async (state) => {
    const f = await fixture()
    const { jobId } = f.service.refreshTrack(f.id)
    const offline = join(f.directory, 'offline.flac')
    renameSync(f.source, offline)
    let reason = ''
    try {
      await readStableMetadata(f.id, f.source, f.cache)
    } catch (error) {
      reason = (error as Error).message
    }
    expect(reason).toContain('ENOENT')
    if (state === 'returned') copyFileSync(offline, f.source)
    emitRefreshMessage({
      type: 'failure',
      payload: { jobId, trackId: f.id, filePath: f.source, reason },
    })
    await completeRefresh(f, jobId)
    expect(f.db.prepare('SELECT availability FROM tracks WHERE id=?').pluck().get(f.id)).toBe(
      state === 'returned' ? 'available' : 'missing',
    )
    expect(f.repo.getJobById(jobId)?.failedTracks).toBe(1)
    const missingEvents = f.send.mock.calls.filter(
      ([channel, event]) => channel === 'library:changed' && event.reason === 'track-missing',
    )
    expect(missingEvents).toHaveLength(state === 'returned' ? 0 : 1)
  },
)

it.each(['lyrics', 'tags', 'track'] as const)(
  'preserves a verified newer save against buffered scan %s data',
  async (mode) => {
    const f = await fixture()
    f.db
      .prepare("INSERT INTO tracks(id,file_path,title) VALUES(99,?,'Gone')")
      .run(join(f.root, 'gone.flac'))
    const scan = await holdScan(f, mode)
    expect(
      scan.messages.some(
        (message) =>
          message.type ===
          ({ lyrics: 'trackLyrics', tags: 'trackTags', track: 'tracks' } as const)[mode],
      ),
    ).toBe(true)
    const saved =
      mode === 'tags'
        ? await f.service.updateTrackMetadata({
            ...f.repo.getEditableTrackMetadata(f.id)!,
            title: 'Edited after scan',
          })
        : await f.service.updateTrackLyrics(
            f.id,
            'Newly saved lyrics',
            async () => {},
            () => {},
          )
    expect(saved.ok).toBe(true)
    const before = f.db.prepare('SELECT * FROM tracks WHERE id=?').get(f.id)
    f.send.mockClear()
    scan.deliver()
    expect(f.db.prepare('SELECT * FROM tracks WHERE id=?').get(f.id)).toEqual(before)
    const disk = await readStableMetadata(f.id, f.source, f.cache)
    expect(mode === 'tags' ? disk.title : disk.lyricsText).toBe(
      mode === 'tags' ? 'Edited after scan' : 'Newly saved lyrics',
    )
    expect(scan.jobs.getById(scan.job.jobId)).toMatchObject({ status: 'completed', failedFiles: 1 })
    expect(
      f.db.prepare('SELECT COUNT(*) FROM scan_failures WHERE job_id=?').pluck().get(scan.job.jobId),
    ).toBe(1)
    expect(f.send.mock.calls.at(-1)?.[1]).toMatchObject({ status: 'completed', failedFiles: 1 })
    expect(f.send).not.toHaveBeenCalledWith(
      'library:changed',
      expect.objectContaining({ reason: 'metadata-refresh' }),
    )
    expect(f.db.prepare('SELECT availability FROM tracks WHERE id=99').pluck().get()).toBe(
      'missing',
    )
    expect(f.db.prepare('SELECT COUNT(*) FROM removed_track_history').pluck().get()).toBe(0)
    expect(
      f.db.prepare('SELECT play_count FROM track_play_stats WHERE track_id=?').pluck().get(f.id),
    ).toBe(7)
  },
)

it('rejects a stale sidecar snapshot independently of the audio and accepts a fresh retry', async () => {
  const f = await fixture()
  const sidecar = join(f.root, 'source.lrc')
  writeFileSync(sidecar, '[00:01]Old local lyrics')
  const scan = await holdScan(f, 'lyrics')
  expect(scan.messages.find((message) => message.type === 'trackLyrics')).toMatchObject({
    payload: [{ lyricsText: '[00:01]Old local lyrics' }],
  })
  const audio = statSync(f.source)
  writeFileSync(sidecar, '[00:02]New external lyrics with different length')
  expect(statSync(f.source)).toMatchObject({
    size: audio.size,
    mtimeMs: audio.mtimeMs,
    ctimeMs: audio.ctimeMs,
    ino: audio.ino,
  })
  scan.deliver()
  expect(f.tracks.getLyricsByTrackId(f.id)?.lyricsText).toBe('Old line')
  expect(scan.jobs.getById(scan.job.jobId)?.failedFiles).toBe(1)
  const retry = await holdScan(f, 'lyrics', scan.persistence)
  retry.deliver()
  expect(f.tracks.getLyricsByTrackId(f.id)?.lyricsText).toBe(
    '[00:02]New external lyrics with different length',
  )
  expect(retry.jobs.getById(retry.job.jobId)).toMatchObject({ status: 'completed', failedFiles: 0 })
})

it('commits an unchanged real refresh result', async () => {
  const f = await fixture()
  const { jobId } = f.service.refreshTrack(f.id)
  const result = await readStableMetadata(f.id, f.source, f.cache)
  workers.at(-1)!.emit('message', { type: 'result', payload: { ...result, jobId, generation: 0 } })
  await completeRefresh(f, jobId)
  expect(f.repo.getJobById(jobId)?.failedTracks).toBe(0)
  expect(f.tracks.getAll()[0].title).toBe('Current1')
})

it.each(['atomic', 'in-place'] as const)(
  'rejects a stale same-size/same-mtime sidecar snapshot: %s',
  async (method) => {
    const f = await fixture()
    const sidecar = join(f.root, 'source.lrc')
    writeFileSync(sidecar, '[00:01]Old sidecar')
    utimesSync(sidecar, 1_600_000_000, 1_600_000_000)
    const scan = await holdScan(f, 'lyrics')
    const before = statSync(sidecar)
    if (method === 'atomic') {
      const replacement = join(f.directory, 'replacement.lrc')
      writeFileSync(replacement, '[00:01]New sidecar')
      utimesSync(replacement, 1_600_000_000, 1_600_000_000)
      renameSync(replacement, sidecar)
    } else {
      writeFileSync(sidecar, '[00:01]New sidecar')
      utimesSync(sidecar, 1_600_000_000, 1_600_000_000)
    }
    const after = statSync(sidecar)
    expect(after.size).toBe(before.size)
    expect(after.mtimeMs).toBe(before.mtimeMs)
    expect(method === 'atomic' ? after.ino !== before.ino : after.ctimeMs !== before.ctimeMs).toBe(
      true,
    )
    expect((await readStableMetadata(f.id, f.source, f.cache)).lyricsText).toBe(
      '[00:01]New sidecar',
    )
    scan.deliver()
    expect(f.tracks.getLyricsByTrackId(f.id)?.lyricsText).toBe('Old line')
    expect(scan.jobs.getById(scan.job.jobId)?.failedFiles).toBe(1)
  },
)
