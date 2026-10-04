import { createRequire } from 'node:module'
import { mkdtemp, mkdir, rename, readFile, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterEach, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateDatabase } from '../../database/schema'
import { TrackRepository } from '../../repositories/trackRepository'
import { LibraryIncrementalImportService } from './libraryIncrementalImportService'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
const roots: string[] = []
const databases: Database.Database[] = []
afterEach(async () => {
  for (const db of databases.splice(0)) db.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'auralis-relocation-'))
  roots.push(root)
  const oldPath = join(root, 'old.flac')
  await promisify(execFile)(
    fileURLToPath(new URL('../../../../resources/audio/ffmpeg.exe', import.meta.url)),
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=0.1',
      '-c:a',
      'flac',
      '-metadata',
      'title=Song',
      '-metadata',
      'artist=Artist',
      '-metadata',
      'album=Album',
      '-metadata',
      'genre=Pop',
      oldPath,
    ],
    { windowsHide: true },
  )
  const db = new DatabaseCtor(':memory:')
  databases.push(db)
  migrateDatabase(db)
  const repo = new TrackRepository(db)
  const send = vi.fn()
  const service = new LibraryIncrementalImportService(repo, join(root, 'artwork'), send)
  expect((await service.importFiles([oldPath])).failed).toEqual([])
  const id = db.prepare('SELECT id FROM tracks').pluck().get() as number
  db.prepare('INSERT INTO track_play_stats(track_id,play_count) VALUES(?,7)').run(id)
  db.prepare(
    "INSERT INTO daily_track_play_stats(play_date,track_id,play_count,duration_seconds) VALUES('2026-10-03',?,7,70)",
  ).run(id)
  db.prepare(
    "INSERT INTO daily_play_stats(play_date,play_count,duration_seconds) VALUES('2026-10-03',7,70)",
  ).run()
  db.prepare("INSERT INTO playlists(id,name) VALUES(1,'Favorites')").run()
  db.prepare('INSERT INTO playlist_tracks(playlist_id,track_id,position) VALUES(1,?,0)').run(id)
  db.prepare(
    "INSERT INTO track_metadata(track_id,title,genre_display,source) VALUES(?,'Display title','Pop','user_edit')",
  ).run(id)
  const tables = [
    'track_play_stats',
    'daily_track_play_stats',
    'daily_play_stats',
    'playlist_tracks',
    'track_metadata',
  ]
  const snapshot = () => tables.map((table) => db.prepare(`SELECT * FROM ${table}`).all())
  send.mockClear()
  return { root, oldPath, db, repo, send, service, id, snapshot }
}

it.each(['available', 'missing', 'case-only', 'directory-move'] as const)(
  'keeps the ID and related rows after an actual file rename from %s',
  async (availability) => {
    const { root, oldPath, db, repo, service, send, id, snapshot } = await fixture()
    const before = snapshot()
    const bytes = await readFile(oldPath)
    const newDirectory = availability === 'directory-move' ? join(root, 'moved') : root
    await mkdir(newDirectory, { recursive: true })
    const newPath = join(newDirectory, availability === 'case-only' ? 'OLD.flac' : 'renamed.flac')
    await rename(oldPath, newPath)
    if (availability === 'missing')
      db.prepare("UPDATE tracks SET availability='missing' WHERE id=?").run(id)
    const result = await service.importFiles([newPath])
    expect(result).toEqual({ imported: [newPath], unstable: [], failed: [] })
    expect(db.prepare('SELECT id,file_path,availability FROM tracks').all()).toEqual([
      { id, file_path: newPath, availability: 'available' },
    ])
    expect(snapshot()).toEqual(before)
    expect(repo.getFilePathById(id)).toBe(newPath)
    expect(await readFile(newPath)).toEqual(bytes)
    expect(send).toHaveBeenCalledWith('library:changed', {
      reason: 'track-relocated',
      trackIds: [id],
      filePaths: [newPath],
    })
    expect(db.pragma('foreign_key_check')).toEqual([])
  },
)

it('imports a copy separately while its original file remains present', async () => {
  const { root, oldPath, db, service, id, snapshot } = await fixture()
  const before = snapshot()
  const newPath = join(root, 'copy.flac')
  await copyFile(oldPath, newPath)
  await service.importFiles([newPath])
  expect(db.prepare('SELECT file_path FROM tracks WHERE id=?').pluck().get(id)).toBe(oldPath)
  expect(db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(2)
  expect(snapshot()).toEqual(before)
})

it('guards an occupied destination and a stale old-path match', async () => {
  const { root, oldPath, db, repo, id, snapshot } = await fixture()
  const before = snapshot()
  const original = db.prepare('SELECT * FROM tracks WHERE id=?').get(id)
  const track = {
    filePath: join(root, 'occupied.flac'),
    fileSize: 100,
    fileMtimeMs: 1,
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    trackNo: null,
    discNo: null,
    durationSeconds: 0.1,
    year: null,
    releaseDate: null,
    copyright: null,
    composer: null,
    genre: 'Pop',
    artworkCacheKey: null,
    lyricsText: null,
    lyricsFormat: null,
    isrc: null,
    metadataSignature: 'test-signature',
  }
  repo.upsertMany([track])
  expect(repo.relocateTrack(id, track, oldPath)).toBe(false)
  expect(
    repo.relocateTrack(
      id,
      { ...track, filePath: join(root, 'free.flac') },
      join(root, 'stale.flac'),
    ),
  ).toBe(false)
  expect(db.prepare('SELECT * FROM tracks WHERE id=?').get(id)).toEqual(original)
  expect(snapshot()).toEqual(before)
})
