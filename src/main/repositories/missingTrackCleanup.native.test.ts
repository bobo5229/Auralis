import { createRequire } from 'node:module'
import { mkdtemp, writeFile, unlink, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateDatabase } from '../database/schema'
import { validateBackupFile } from '../database/databaseBackupService'
import { MissingTrackCleanupRepository } from './missingTrackCleanupRepository'
import { TrackRepository } from './trackRepository'
import type { MissingTrackCandidate } from './trackRepository'
import { PlayStatsRepository } from './playStatsRepository'
import { ArtworkCacheGarbageCollector } from '@main/features/artwork/artworkCacheGarbageCollector'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
  options?: Database.Options,
) => Database.Database
const dirs: string[] = []
const databases: Database.Database[] = []
afterEach(async () => {
  for (const db of databases.splice(0)) if (db.open) db.close()
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'auralis-missing-cleanup-'))
  dirs.push(root)
  const db = new DatabaseCtor(':memory:')
  databases.push(db)
  migrateDatabase(db)
  db.pragma('foreign_keys = ON')
  const tracks = new TrackRepository(db)
  const stats = new PlayStatsRepository(db)
  const oldPath = join(root, 'old.flac')
  const track = {
    filePath: oldPath,
    fileSize: 100,
    fileMtimeMs: 1,
    title: 'Gone song',
    artist: 'Artist',
    album: 'Gone album',
    albumArtist: 'Artist',
    trackNo: null,
    discNo: null,
    durationSeconds: 180,
    year: null,
    releaseDate: null,
    copyright: null,
    composer: null,
    genre: 'Pop',
    artworkCacheKey: `v2-${'a'.repeat(64)}.webp`,
    lyricsText: null,
    lyricsFormat: null,
    isrc: null,
    metadataSignature: 'test',
  }
  tracks.upsertMany([track])
  const id = db.prepare('SELECT id FROM tracks').pluck().get() as number
  db.prepare(
    "INSERT INTO track_metadata(track_id,title,genre_display,artwork_cache_key,source) VALUES(?,'Edited title','Live; Pop',?,'user_edit')",
  ).run(id, track.artworkCacheKey)
  db.prepare("INSERT INTO artists(id,name) VALUES(1,'Artist')").run()
  db.prepare(
    "INSERT INTO track_artists(track_id,artist_id,position,role) VALUES(?,1,0,'primary')",
  ).run(id)
  db.prepare("INSERT INTO playlists(id,name) VALUES(1,'Favorites')").run()
  db.prepare('INSERT INTO playlist_tracks(playlist_id,track_id,position) VALUES(1,?,0)').run(id)
  stats.incrementPlayCount(id, '2026-10-03T10:00:00Z', '2026-10-03')
  stats.incrementPlayCount(id, '2026-10-04T10:00:00Z', '2026-10-04')
  const cleanup = new MissingTrackCleanupRepository(db)
  const remove = () => db.transaction(() => cleanup.removeConfirmedMissing(root))()
  db.prepare("UPDATE tracks SET availability='missing' WHERE id=?").run(id)
  return { root, db, tracks, stats, track, id, oldPath, remove, cleanup }
}

it('removes an actually deleted file from the collection and preserves all committed listening history', async () => {
  const { root, db, tracks, track, id, oldPath, remove } = await fixture()
  await writeFile(oldPath, 'isolated fixture')
  await unlink(oldPath)
  const daily = db.prepare('SELECT * FROM daily_play_stats ORDER BY play_date').all()
  const history = () => ({
    tracks: db.prepare('SELECT * FROM listening_track_display ORDER BY id').all(),
    plays: db
      .prepare('SELECT * FROM listening_daily_track_play_stats ORDER BY play_date,track_id')
      .all(),
  })
  const before = history()
  expect(remove()).toEqual([id])
  for (const table of [
    'tracks',
    'track_metadata',
    'track_artists',
    'playlist_tracks',
    'track_play_stats',
    'daily_track_play_stats',
    'albums',
    'artists',
  ])
    expect(db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get()).toBe(0)
  expect(tracks.getFilePathById(id)).toBeNull()
  expect(db.prepare('SELECT * FROM daily_play_stats ORDER BY play_date').all()).toEqual(daily)
  expect(history()).toEqual(before)
  expect(before.tracks).toEqual([
    expect.objectContaining({ id, title: 'Edited title', album: 'Gone album', genre: 'Live; Pop' }),
  ])
  expect(before.plays).toEqual([
    expect.objectContaining({ play_date: '2026-10-03', track_id: id, play_count: 1 }),
    expect.objectContaining({ play_date: '2026-10-04', track_id: id, play_count: 1 }),
  ])
  expect(
    db.prepare('SELECT play_count FROM removed_track_history WHERE id=?').pluck().get(id),
  ).toBe(2)
  const recovery = JSON.parse(
    db
      .prepare('SELECT recovery_json FROM removed_track_history WHERE id=?')
      .pluck()
      .get(id) as string,
  )
  expect(recovery.track.file_path).toBe(oldPath)
  expect(recovery.metadata.title).toBe('Edited title')
  expect(recovery.playlists).toHaveLength(1)
  expect(recovery.artistRows[0].name).toBe('Artist')
  const cache = join(root, 'cache')
  await mkdir(cache)
  await writeFile(join(cache, track.artworkCacheKey), 'artwork')
  expect((await new ArtworkCacheGarbageCollector(db, cache).collectGarbage()).orphanFileCount).toBe(
    0,
  )
  expect(db.pragma('foreign_key_check')).toEqual([])
  expect(remove()).toEqual([])
  const backup = join(root, 'history.sqlite')
  await db.backup(backup)
  expect(validateBackupFile(backup, DatabaseCtor)).toEqual({ ok: true })
})

it.each(['file-present', 'root-absent', 'outside-root', 'available', 'possible-move'] as const)(
  'keeps the record for %s',
  async (reason) => {
    const { root, db, tracks, track, id, oldPath, remove } = await fixture()
    if (reason === 'file-present') await writeFile(oldPath, 'exists')
    if (reason === 'root-absent') await rm(root, { recursive: true, force: true })
    if (reason === 'outside-root')
      db.prepare('UPDATE tracks SET file_path=? WHERE id=?').run(
        join(root, '..', 'outside.flac'),
        id,
      )
    if (reason === 'available')
      db.prepare("UPDATE tracks SET availability='available' WHERE id=?").run(id)
    if (reason === 'possible-move')
      tracks.upsertMany([{ ...track, filePath: join(root, 'already-imported.flac') }])
    expect(remove()).toEqual([])
    expect(db.prepare('SELECT id FROM tracks WHERE id=?').pluck().get(id)).toBe(id)
    expect(db.prepare('SELECT COUNT(*) FROM removed_track_history').pluck().get()).toBe(0)
  },
)

it('preserves shared albums, artists and other playlist entries', async () => {
  const { root, db, tracks, track, id, remove } = await fixture()
  tracks.upsertMany([
    { ...track, filePath: join(root, 'other.flac'), title: 'Other song', durationSeconds: 300 },
  ])
  const otherId = db.prepare('SELECT MAX(id) FROM tracks').pluck().get() as number
  db.prepare(
    "INSERT INTO track_artists(track_id,artist_id,position,role) VALUES(?,1,0,'primary')",
  ).run(otherId)
  db.prepare('INSERT INTO playlist_tracks(playlist_id,track_id,position) VALUES(1,?,1)').run(
    otherId,
  )
  expect(remove()).toEqual([id])
  expect(db.prepare('SELECT COUNT(*) FROM albums').pluck().get()).toBe(1)
  expect(db.prepare('SELECT COUNT(*) FROM artists').pluck().get()).toBe(1)
  expect(db.prepare('SELECT track_id,position FROM playlist_tracks').all()).toEqual([
    { track_id: otherId, position: 1 },
  ])
})

it('rolls the entire removal back when archiving fails', async () => {
  const { db, remove } = await fixture()
  const tables = [
    'tracks',
    'track_metadata',
    'track_play_stats',
    'daily_track_play_stats',
    'daily_play_stats',
    'playlist_tracks',
    'albums',
    'artists',
    'removed_track_history',
    'removed_daily_track_play_stats',
  ]
  const snapshot = () => tables.map((t) => db.prepare(`SELECT * FROM ${t}`).all())
  const before = snapshot()
  db.exec(
    "CREATE TRIGGER fail_archive BEFORE INSERT ON removed_daily_track_play_stats BEGIN SELECT RAISE(ABORT,'injected failure'); END",
  )
  expect(remove).toThrow('injected failure')
  expect(snapshot()).toEqual(before)
})

it('reserves removed IDs for history and treats reimport as a new collection entry', async () => {
  const { db, tracks, track, id, remove } = await fixture()
  expect(remove()).toEqual([id])
  tracks.upsertMany([track])
  const newId = db.prepare('SELECT id FROM tracks').pluck().get() as number
  expect(newId).toBeGreaterThan(id)
  expect(db.prepare('SELECT id FROM removed_track_history').pluck().get()).toBe(id)
  expect(() =>
    db.prepare('INSERT INTO tracks(id,file_path) VALUES(?,?)').run(id, 'forced-reuse.flac'),
  ).toThrow('reserved')
  expect(db.pragma('foreign_key_check')).toEqual([])
})

it('requires a commit transaction and includes removed history in resetAll', async () => {
  const { db, id, stats, cleanup, root, remove } = await fixture()
  expect(() => cleanup.removeConfirmedMissing(root)).toThrow('requires a transaction')
  expect(remove()).toEqual([id])
  stats.resetAll()
  expect(db.prepare('SELECT * FROM listening_daily_track_play_stats').all()).toEqual([])
  expect(db.prepare('SELECT * FROM daily_play_stats').all()).toEqual([])
  expect(db.prepare('SELECT * FROM track_play_stats').all()).toEqual([])
  expect(db.prepare('SELECT play_count FROM removed_track_history').pluck().get()).toBe(0)
  expect(db.prepare('SELECT COUNT(*) FROM removed_daily_track_play_stats').pluck().get()).toBe(0)
})

it('only cleans affected unused albums and retains unrelated catalog rows', async () => {
  const { db, id, remove } = await fixture()
  db.prepare(
    "INSERT INTO albums(title,artist) VALUES('Edited album','Edited artist'),('Unrelated album','Unrelated artist')",
  ).run()
  db.prepare("INSERT INTO artists(id,name) VALUES(99,'Unrelated artist')").run()
  db.prepare(
    "UPDATE track_metadata SET album_title='Edited album',album_artist_display='Edited artist' WHERE track_id=?",
  ).run(id)
  expect(remove()).toEqual([id])
  expect(db.prepare('SELECT title FROM albums').pluck().all()).toEqual(['Unrelated album'])
  expect(db.prepare('SELECT name FROM artists').pluck().all()).toEqual(['Unrelated artist'])
  const snapshot = JSON.parse(
    db.prepare('SELECT recovery_json FROM removed_track_history').pluck().get() as string,
  )
  expect(snapshot.albumRows).toHaveLength(2)
})

it('rolls back if a delete guard or trigger prevents removing the expected row', async () => {
  const { db, id, remove } = await fixture()
  db.exec('CREATE TRIGGER stop_delete BEFORE DELETE ON tracks BEGIN SELECT RAISE(IGNORE); END')
  expect(remove).toThrow('changed during cleanup')
  expect(db.prepare('SELECT COUNT(*) FROM removed_track_history').pluck().get()).toBe(0)
  expect(
    db.prepare('SELECT play_count FROM track_play_stats WHERE track_id=?').pluck().get(id),
  ).toBe(2)
})

it('preserves singleton move checks for every candidate in an ambiguous identity group', async () => {
  const { db, tracks, track, root, id, remove } = await fixture()
  tracks.upsertMany([
    { ...track, filePath: join(root, 'second-missing.flac') },
    { ...track, filePath: join(root, 'available-copy.flac') },
  ])
  const otherId = db
    .prepare('SELECT id FROM tracks WHERE file_path=?')
    .pluck()
    .get(join(root, 'second-missing.flac')) as number
  db.prepare("UPDATE tracks SET availability='missing' WHERE id=?").run(otherId)
  expect(remove()).toEqual([])
  expect(
    db.prepare("SELECT id FROM tracks WHERE availability='missing' ORDER BY id").pluck().all(),
  ).toEqual([id, otherId])
})

it('keeps the existing identity and version boundaries when checking a mixed batch', async () => {
  const { db, root, id, remove } = await fixture()
  type IdentityPatch = Partial<
    Pick<
      MissingTrackCandidate,
      'title' | 'artist' | 'album' | 'isrc' | 'durationSeconds' | 'fileSize'
    >
  >
  const cases: Array<{ missing?: IdentityPatch; available?: IdentityPatch; keep: boolean }> = [
    {
      missing: { isrc: 'SAME' },
      available: { isrc: 'SAME', title: 'Renamed', artist: null, album: null, fileSize: 900 },
      keep: true,
    },
    {
      missing: { isrc: 'SHORT' },
      available: { isrc: 'SHORT', durationSeconds: 4882 },
      keep: false,
    },
    {
      missing: { isrc: 'UNKNOWN' },
      available: { isrc: 'UNKNOWN', durationSeconds: null },
      keep: false,
    },
    { missing: { isrc: 'OLD' }, available: { isrc: 'NEW' }, keep: false },
    { missing: { isrc: null }, available: { isrc: 'NEW-ONLY' }, keep: true },
    { missing: { isrc: '' }, available: { isrc: '' }, keep: true },
    { missing: { title: null }, available: { title: null }, keep: false },
    { missing: { artist: null }, available: { artist: null }, keep: false },
    { missing: { title: '' }, available: { title: '' }, keep: true },
    { available: { durationSeconds: 181 }, keep: true },
    { available: { durationSeconds: 182 }, keep: false },
    { available: { fileSize: 102 }, keep: true },
    { available: { fileSize: 103 }, keep: false },
    { available: { album: 'Different album' }, keep: false },
    { available: { album: null }, keep: true },
    { available: { album: 'Unknown Album' }, keep: true },
    {
      missing: { title: 'A; B', artist: 'C' },
      available: { title: 'A', artist: 'B; C' },
      keep: false,
    },
  ]
  const insert = db.prepare(
    'INSERT INTO tracks(id,file_path,title,artist,album,isrc,duration_seconds,file_size,availability) VALUES(?,?,?,?,?,?,?,?,?)',
  )
  const expectedRemoved = [id]
  const expectedKept: number[] = []
  db.transaction(() => {
    for (const [index, testCase] of cases.entries()) {
      const missingId = index * 2 + 2
      const defaults = {
        title: `Title ${index}`,
        artist: `Artist ${index}`,
        album: 'Album',
        isrc: null,
        durationSeconds: 180,
        fileSize: 100,
      }
      for (const [trackId, patch, availability] of [
        [missingId, testCase.missing, 'missing'],
        [missingId + 1, testCase.available, 'available'],
      ] as const) {
        const identity = { ...defaults, ...patch }
        insert.run(
          trackId,
          join(root, `case-${trackId}.flac`),
          identity.title,
          identity.artist,
          identity.album,
          identity.isrc,
          identity.durationSeconds,
          identity.fileSize,
          availability,
        )
      }
      if (testCase.keep) expectedKept.push(missingId)
      else expectedRemoved.push(missingId)
    }
  })()
  expect(remove()).toEqual(expectedRemoved)
  expect(
    db.prepare("SELECT id FROM tracks WHERE availability='missing' ORDER BY id").pluck().all(),
  ).toEqual(expectedKept)
  expect(db.pragma('foreign_key_check')).toEqual([])
})
