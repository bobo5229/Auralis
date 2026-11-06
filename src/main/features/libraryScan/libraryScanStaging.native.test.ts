import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, expect, it, vi } from 'vitest'
import { migrateDatabase } from '@main/database/schema'
import { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import { ScanJobRepository } from '@main/repositories/scanJobRepository'
import { TrackRepository } from '@main/repositories/trackRepository'
import { TrackQueryRepository } from '@main/repositories/trackQueryRepository'
import { ScanStagingRepository } from '@main/repositories/scanStagingRepository'
import * as parser from '../metadata/parseAudioMetadata'
import { LibraryScanPersistence } from './libraryScanPersistence'
import { runLibraryScan } from './libraryScanRun'
import type { LibraryScanWorkerMessage, ScannedTrackFile } from './libraryScanTypes'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as typeof Database
const fixtures: { db: Database.Database; directory: string }[] = []

function fixture() {
  const directory = mkdtempSync(join(resolve('output'), 'scan-staging-'))
  const db = new DatabaseCtor(join(directory, 'library.sqlite'))
  fixtures.push({ db, directory })
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  migrateDatabase(db)
  const audioDirectory = join(directory, 'music')
  mkdirSync(audioDirectory)
  const filePath = join(audioDirectory, 'song.wav')
  const wav = Buffer.alloc(44 + 16000)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(8000, 24)
  wav.writeUInt32LE(16000, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(16000, 40)
  writeFileSync(filePath, wav)
  const roots = new LibraryRootRepository(db),
    jobs = new ScanJobRepository(db),
    tracks = new TrackRepository(db)
  const root = roots.upsertByPath(audioDirectory)
  const staging = new ScanStagingRepository(db)
  const events = { progress: vi.fn(), changed: vi.fn() }
  const persistence = new LibraryScanPersistence(db, roots, jobs, tracks, events)
  async function scan(complete: boolean) {
    const job = jobs.create(root.id)
    persistence.begin()
    staging.pruneInventories()
    await runLibraryScan(
      {
        jobId: job.jobId,
        rootPath: root.path,
        rootId: root.id,
        databasePath: db.name,
        knownFiles: [],
        artworkCacheDir: directory,
      },
      (message) => {
        if (message.type !== 'complete' || complete) persistence.handleMessage(message, job.jobId)
      },
    )
    if (!complete) jobs.finish(job.jobId, 'canceled')
    return job
  }
  return { db, root, roots, jobs, tracks, staging, events, persistence, directory, filePath, scan }
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const { db, directory } of fixtures.splice(0)) {
    db.close()
    if (directory.startsWith(join(resolve('output'), 'scan-staging-')))
      rmSync(directory, { recursive: true, force: true })
  }
})

it.each(['unchanged', 'audio', 'lyrics', 'cover', 'parser'] as const)(
  'reuses canceled parsing only while all fingerprints remain current: %s',
  async (change) => {
    const f = fixture()
    const parse = vi.spyOn(parser, 'parseAudioMetadata')
    vi.spyOn(TrackQueryRepository.prototype, 'getKnownFiles').mockImplementation(() => {
      throw new Error('Whole-library query is forbidden in the file-backed reader')
    })
    await f.scan(false)
    expect(parse).toHaveBeenCalledTimes(1)
    expect(f.db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(0)
    expect(f.db.prepare('SELECT COUNT(*) FROM scan_staged_tracks').pluck().get()).toBe(1)
    if (change === 'audio') {
      const bytes = readFileSync(f.filePath)
      bytes[bytes.length - 1] = 1
      writeFileSync(f.filePath, bytes)
    } else if (change === 'lyrics')
      writeFileSync(f.filePath.replace('.wav', '.lrc'), '[00:00.00]changed')
    else if (change === 'cover')
      writeFileSync(join(f.root.path, 'cover.jpg'), 'invalid cover still invalidates the cache')
    else if (change === 'parser')
      f.db.exec(
        "UPDATE scan_staged_tracks SET snapshot_json=json_set(snapshot_json,'$.metadataParserVersion','outdated')",
      )
    const job = await f.scan(true)
    expect(parse).toHaveBeenCalledTimes(change === 'unchanged' ? 1 : 2)
    expect(f.jobs.getById(job.jobId)?.status).toBe('completed')
    expect(f.db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(1)
    expect(f.db.prepare('SELECT COUNT(*) FROM scan_staged_tracks').pluck().get()).toBe(0)
    expect(f.db.prepare('SELECT COUNT(*) FROM scan_inventory').pluck().get()).toBe(0)
  },
)

it('streams large pending payloads in bounded batches and decides ambiguous moves across pages', async () => {
  const f = fixture()
  await f.scan(false)
  const staged = f.staging.readCached<ScannedTrackFile>(f.root.id, f.filePath)!
  const identity = (track: ScannedTrackFile) => {
    track.title = 'Identity'
    track.artist = 'Artist'
    track.album = 'Album'
    track.albumArtist = 'Artist'
    if (track.fileTags)
      Object.assign(track.fileTags, {
        title: 'Identity',
        artistDisplay: 'Artist',
        albumTitle: 'Album',
        albumArtistDisplay: 'Artist',
      })
  }
  identity(staged)
  const oldPath = join(f.root.path, 'absent.wav')
  f.tracks.upsertMany([{ ...staged, filePath: oldPath }])
  const oldId = f.tracks.getTrackIdsByFilePaths([oldPath])[0]
  const job = f.jobs.create(f.root.id)
  f.persistence.begin()
  f.staging.pruneInventories()
  const paths: string[] = []
  const total = 601
  for (let index = 0; index < total; index++) {
    // All claims share identity but only this unchanged source path must pass stat.
    // Two existing files on opposite sides of a page boundary claim the old track.
    const path =
      index === 0 ? f.filePath : join(f.root.path, `${String(index).padStart(4, '0')}.wav`)
    writeFileSync(path, readFileSync(f.filePath))
    paths.push(path)
  }
  // Use the real reader for every new file, then give them the ambiguous identity.
  await runLibraryScan(
    {
      jobId: job.jobId,
      rootId: f.root.id,
      rootPath: f.root.path,
      databasePath: f.db.name,
      knownFiles: [],
      artworkCacheDir: f.directory,
    },
    (message) => {
      if (message.type === 'tracks') for (const track of message.payload) identity(track)
      if (message.type !== 'complete') f.persistence.handleMessage(message, job.jobId)
    },
  )
  const write = vi.spyOn(f.tracks, 'upsertMany')
  expect(f.persistence.exportSettlement()).toEqual({ hadFailures: false })
  const complete: LibraryScanWorkerMessage = {
    type: 'complete',
    payload: { foundFilePaths: paths, unreadableDirectoryPaths: [] },
  }
  f.persistence.handleMessage(complete, job.jobId)
  expect(write.mock.calls.map(([batch]) => batch.length)).toEqual([300, 300, 1])
  expect(f.tracks.getMissingCandidates().map((row) => row.trackId)).toContain(oldId)
  expect(
    f.db.prepare("SELECT COUNT(*) FROM tracks WHERE availability='available'").pluck().get(),
  ).toBe(total)
  expect(f.db.prepare('SELECT COUNT(*) FROM scan_staged_tracks').pluck().get()).toBe(0)
}, 15000)
