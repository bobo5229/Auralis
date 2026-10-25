import { createLibraryScanEvents } from '@main/ipc/libraryScanEvents'
import { createRequire } from 'node:module'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type Database from 'better-sqlite3'
import { afterEach, expect, it, vi } from 'vitest'
import { migrateDatabase } from '@main/database/schema'
import { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import { ScanJobRepository } from '@main/repositories/scanJobRepository'
import { TrackRepository } from '@main/repositories/trackRepository'
import { LibraryScanPersistence } from './libraryScanPersistence'
import { LibraryScanTrackReader } from './libraryScanTrackReader'
import { LibraryScanArtwork } from './libraryScanArtwork'
import { runLibraryScan } from './libraryScanRun'
import type { LibraryScanWorkerMessage } from './libraryScanTypes'

const unreadable = vi.hoisted(() => new Set<string>())
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    statSync: (path: string) => {
      if (unreadable.has(path)) throw Object.assign(new Error('denied'), { code: 'EACCES' })
      return actual.statSync(path)
    },
  }
})

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
const ffmpeg = fileURLToPath(new URL('../../../../resources/audio/ffmpeg.exe', import.meta.url))
const fixtures: { directory: string; db: Database.Database }[] = []
const associatedTables = ['playlist_tracks', 'track_play_stats', 'track_metadata']

async function audio(path: string, title: string, isrc: string | null): Promise<void> {
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
      title === 'Identity' ? 'sine=frequency=440:duration=1' : 'sine=frequency=880:duration=3',
      '-c:a',
      'flac',
      '-metadata',
      `title=${title}`,
      '-metadata',
      'artist=Artist',
      '-metadata',
      'album=Album',
      ...(isrc ? ['-metadata', `ISRC=${isrc}`] : []),
      path,
    ],
    { windowsHide: true },
  )
}

async function fixture(isrc: string | null = null, { alias = false, duplicate = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'auralis-scan-commit-'))
  const rootPath = join(directory, 'library')
  const cachePath = join(directory, 'artwork')
  mkdirSync(rootPath)
  const original = join(rootPath, 'original.flac')
  const incoming = join(rootPath, alias ? 'ORIGINAL.flac' : 'copy.flac')
  const offline = join(directory, 'offline.flac')
  const db = new DatabaseCtor(':memory:')
  fixtures.push({ directory, db })
  migrateDatabase(db)
  db.pragma('foreign_keys = ON')
  await audio(original, 'Identity', isrc)
  const reader = new LibraryScanTrackReader(
    [],
    new LibraryScanArtwork(cachePath),
    (path, reason) => {
      throw new Error(`Unexpected read failure: ${path}: ${reason}`)
    },
  )
  const parsed = await reader.read(original)
  if (parsed.kind !== 'track') throw new Error('Expected a parsed FLAC')
  const tracks = new TrackRepository(db)
  tracks.upsertMany([parsed.track])
  const id = tracks.getTrackIdsByFilePaths([original])[0]
  db.exec("INSERT INTO playlists(id,name) VALUES(1,'Favorites')")
  db.prepare('INSERT INTO playlist_tracks(playlist_id,track_id,position) VALUES(1,?,0)').run(id)
  db.prepare('INSERT INTO track_play_stats(track_id,play_count) VALUES(?,7)').run(id)
  db.prepare(
    "INSERT INTO track_metadata(track_id,title,source) VALUES(?,'Edited title','user_edit')",
  ).run(id)
  const associations = () =>
    associatedTables.map((table) => db.prepare(`SELECT * FROM ${table}`).all())
  const beforeAssociations = associations()
  renameSync(original, offline)
  copyFileSync(offline, incoming)
  // Whole seconds make a later same-size/same-mtime replacement deterministic on Windows.
  utimesSync(incoming, 1_600_000_000, 1_600_000_000)
  const second = join(rootPath, 'second-copy.flac')
  if (duplicate) copyFileSync(incoming, second)
  const roots = new LibraryRootRepository(db)
  const jobs = new ScanJobRepository(db)
  const root = roots.upsertByPath(rootPath)
  const job = jobs.create(root.id)
  const send = vi.fn()
  const persistence = new LibraryScanPersistence(
    db,
    roots,
    jobs,
    tracks,
    createLibraryScanEvents(send),
  )
  persistence.begin()
  const messages: LibraryScanWorkerMessage[] = []
  // Keep the real inventory, reader, metadata parser and reporter. Only delivery
  // of the final worker message is held back to reproduce the filesystem race.
  await runLibraryScan(
    { jobId: job.jobId, rootPath, knownFiles: tracks.getKnownFiles(), artworkCacheDir: cachePath },
    (message) => messages.push(message),
  )
  for (const message of messages) {
    if (message.type !== 'complete') persistence.handleMessage(message, job.jobId)
  }
  const batch = messages.find((message) => message.type === 'tracks')
  if (batch?.type !== 'tracks') throw new Error('Expected scanned tracks')
  const incomingTrack = batch.payload.find((track) => track.filePath === incoming)!
  const complete = () => {
    const message = messages.at(-1)!
    expect(message.type).toBe('complete')
    persistence.handleMessage(message, job.jobId)
  }
  return {
    db,
    tracks,
    id,
    original,
    incoming,
    offline,
    second,
    directory,
    incomingTrack,
    complete,
    jobs,
    job,
    send,
    associations,
    beforeAssociations,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  unreadable.clear()
  for (const { db, directory } of fixtures.splice(0)) {
    db.close()
    expect(relative(tmpdir(), directory)).toMatch(/^auralis-scan-commit-[^\\/]+$/)
    rmSync(directory, { recursive: true, force: true })
  }
})

it.each([null, 'USAAA2600001'])(
  'keeps the original ID, availability and associations when its file returns: %s',
  async (isrc) => {
    const f = await fixture(isrc)
    copyFileSync(f.offline, f.original)
    f.complete()
    expect(f.tracks.getFilePathById(f.id)).toBe(f.original)
    expect(f.db.prepare('SELECT availability FROM tracks WHERE id=?').pluck().get(f.id)).toBe(
      'available',
    )
    expect(f.associations()).toEqual(f.beforeAssociations)
    expect(f.db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(2)
    expect(f.db.prepare('SELECT COUNT(*) FROM removed_track_history').pluck().get()).toBe(0)
    expect(f.send).toHaveBeenCalledWith(
      'library:changed',
      expect.objectContaining({ reason: 'track-restored', trackIds: [f.id] }),
    )
    expect(f.send).not.toHaveBeenCalledWith(
      'library:changed',
      expect.objectContaining({ reason: 'track-relocated' }),
    )
    expect(f.send).not.toHaveBeenCalledWith(
      'library:changed',
      expect.objectContaining({ reason: 'track-missing' }),
    )
  },
)

it.each(['move', 'ISRC move', 'case-only rename'])(
  'preserves identity, user edits and associations for a stable %s',
  async (scenario) => {
    const f = await fixture(scenario === 'ISRC move' ? 'USAAA2600001' : null, {
      alias: scenario === 'case-only rename',
    })
    f.complete()
    expect(f.tracks.getFilePathById(f.id)).toBe(f.incoming)
    expect(f.associations()).toEqual(f.beforeAssociations)
    expect(f.db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(1)
    expect(f.jobs.getById(f.job.jobId)).toMatchObject({ status: 'completed', failedFiles: 0 })
    expect(f.send).toHaveBeenCalledWith(
      'library:changed',
      expect.objectContaining({ reason: 'track-relocated', trackIds: [f.id] }),
    )
  },
)

it.each(['replaced', 'same size and mtime', 'deleted', 'directory', 'unreadable'])(
  'rejects stale metadata and protects missing records when the new file is %s',
  async (scenario) => {
    const f = await fixture()
    if (scenario === 'replaced') await audio(f.incoming, 'Different recording', null)
    else if (scenario === 'same size and mtime') {
      const replacement = join(f.directory, 'replacement.flac')
      const bytes = readFileSync(f.incoming)
      const title = bytes.indexOf(Buffer.from('Identity'))
      expect(title).toBeGreaterThan(0)
      Buffer.from('Replaced').copy(bytes, title)
      writeFileSync(replacement, bytes)
      utimesSync(replacement, 1_600_000_000, 1_600_000_000)
      renameSync(replacement, f.incoming)
      expect(statSync(f.incoming)).toMatchObject({
        size: f.incomingTrack.fileSize,
        mtimeMs: f.incomingTrack.fileMtimeMs,
      })
      expect(statSync(f.incoming).ino).not.toBe(f.incomingTrack.fileFingerprint.ino)
    } else if (scenario === 'unreadable') unreadable.add(f.incoming)
    else {
      unlinkSync(f.incoming)
      if (scenario === 'directory') mkdirSync(f.incoming)
    }
    f.complete()
    expect(f.tracks.getFilePathById(f.id)).toBe(f.original)
    expect(f.associations()).toEqual(f.beforeAssociations)
    expect(f.db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(1)
    expect(f.db.prepare('SELECT COUNT(*) FROM removed_track_history').pluck().get()).toBe(0)
    expect(f.jobs.getById(f.job.jobId)).toMatchObject({ status: 'completed', failedFiles: 1 })
    expect(f.db.prepare('SELECT file_path,reason FROM scan_failures').all()).toEqual([
      {
        file_path: f.incoming,
        reason: 'Audio file changed or became unavailable before committing scanned tracks',
      },
    ])
    expect(f.send.mock.calls.at(-1)?.[1]).toMatchObject({ status: 'completed', failedFiles: 1 })
    expect(f.send).not.toHaveBeenCalledWith(
      'library:changed',
      expect.objectContaining({ reason: 'track-added' }),
    )
    expect(f.send).not.toHaveBeenCalledWith(
      'library:changed',
      expect.objectContaining({ reason: 'track-relocated' }),
    )
  },
)

it('does not treat an unreadable old path as absent', async () => {
  const f = await fixture()
  unreadable.add(f.original)
  f.complete()
  expect(f.tracks.getFilePathById(f.id)).toBe(f.original)
  expect(f.associations()).toEqual(f.beforeAssociations)
  expect(f.db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(2)
})

it('rejects pending new-track lyrics when a sidecar appears before completion', async () => {
  const f = await fixture()
  writeFileSync(f.incoming.replace(/\.flac$/, '.lrc'), '[00:01]New sidecar')
  f.complete()
  expect(f.tracks.getFilePathById(f.id)).toBe(f.original)
  expect(f.jobs.getById(f.job.jobId)?.failedFiles).toBe(1)
  expect(f.associations()).toEqual(f.beforeAssociations)
  expect(f.db.prepare('SELECT COUNT(*) FROM removed_track_history').pluck().get()).toBe(0)
})

it('keeps ambiguous move claims when one of two incoming copies disappears', async () => {
  const f = await fixture(null, { duplicate: true })
  unlinkSync(f.second)
  f.complete()
  expect(f.tracks.getFilePathById(f.id)).toBe(f.original)
  expect(f.db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(2)
  expect(f.jobs.getById(f.job.jobId)?.failedFiles).toBe(1)
  expect(f.associations()).toEqual(f.beforeAssociations)
})

it('rechecks a pending addition before retrying a failed batch', async () => {
  const f = await fixture()
  copyFileSync(f.offline, f.original)
  vi.spyOn(f.tracks, 'upsertMany').mockImplementationOnce(() => {
    unlinkSync(f.incoming)
    throw new Error('injected batch failure')
  })
  f.complete()
  expect(f.db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(1)
  expect(f.jobs.getById(f.job.jobId)?.failedFiles).toBe(1)
  expect(f.associations()).toEqual(f.beforeAssociations)
})

it.each(['move', 'restoration'])(
  'rolls back %s and publishes no library change when finalization fails',
  async (scenario) => {
    const f = await fixture()
    if (scenario === 'restoration') copyFileSync(f.offline, f.original)
    const before = f.db.prepare('SELECT * FROM tracks').all()
    f.db.exec(
      "CREATE TRIGGER reject_scan_completion BEFORE UPDATE ON scan_jobs WHEN NEW.status='completed' BEGIN SELECT RAISE(ABORT,'injected commit failure'); END",
    )
    f.send.mockClear()
    expect(f.complete).toThrow('injected commit failure')
    expect(f.db.prepare('SELECT * FROM tracks').all()).toEqual(before)
    expect(f.associations()).toEqual(f.beforeAssociations)
    expect(f.jobs.getById(f.job.jobId)?.status).toBe('scanning')
    expect(f.send).not.toHaveBeenCalled()
  },
)
