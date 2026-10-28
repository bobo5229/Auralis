import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, expect, it, vi } from 'vitest'
import type { ScannedTrack } from '@shared/types/libraryScan'
import { migrateDatabase } from '../database/schema'
import { TrackRepository } from './trackRepository'
import { LibraryRepository } from './libraryRepository'
import { AlbumMaintenanceRepository } from './albumMaintenanceRepository'
import { MissingTrackCleanupRepository } from './missingTrackCleanupRepository'
import { ArtworkCacheGarbageCollector } from '../features/artwork/artworkCacheGarbageCollector'
import { ArtworkCacheMaintenanceService } from '../features/artwork/artworkCacheMaintenanceService'
import { ArtworkCacheMigrationService } from '../features/artwork/artworkCacheMigrationService'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as typeof Database
const roots: string[] = []
const databases: Database.Database[] = []
afterEach(() => {
  for (const db of databases.splice(0).reverse()) if (db.open) db.close()
  for (const root of roots.splice(0)) {
    if (
      resolve(dirname(root)) !== resolve(tmpdir()) ||
      !basename(root).startsWith('auralis-album-maintenance-')
    )
      throw new Error('Unsafe album fixture cleanup')
    rmSync(root, { recursive: true, force: true })
  }
})

const key = (seed: string) => `v2-${seed.repeat(64)}.webp`
function setup(file = false) {
  const root = mkdtempSync(join(tmpdir(), 'auralis-album-maintenance-'))
  roots.push(root)
  const cache = join(root, 'cache')
  mkdirSync(cache)
  const dbPath = join(root, 'test.sqlite')
  const db = new DatabaseCtor(file ? dbPath : ':memory:')
  databases.push(db)
  db.pragma('journal_mode=WAL')
  migrateDatabase(db)
  const tracks = new TrackRepository(db)
  return {
    root,
    cache,
    db,
    dbPath,
    tracks,
    stats: new LibraryRepository(db),
    albums: new AlbumMaintenanceRepository(db),
    collector: new ArtworkCacheGarbageCollector(db, cache),
  }
}
function scanned(filePath: string, album: string, artworkCacheKey = key('a')): ScannedTrack {
  return {
    filePath,
    fileSize: 100,
    fileMtimeMs: 1,
    title: 'Track',
    artist: 'Artist',
    album,
    albumArtist: 'Artist',
    trackNo: 1,
    discNo: 1,
    durationSeconds: 180,
    bitrateBps: null,
    year: null,
    releaseDate: null,
    copyright: null,
    composer: null,
    genre: null,
    artworkCacheKey,
    lyricsText: null,
    lyricsFormat: null,
    isrc: null,
    metadataSignature: album,
  }
}

it('counts a renamed album once, prunes its obsolete row and reclaims only obsolete artwork', async () => {
  const state = setup()
  const { root, cache, db, tracks, stats, collector } = state
  const original = scanned(join(root, 'song.flac'), 'Old album')
  tracks.upsertMany([original])
  expect(stats.getStats()).toEqual({ trackCount: 1, albumCount: 1 })
  tracks.upsertMany([{ ...original, album: 'New album', artworkCacheKey: key('b') }])
  expect(stats.getStats()).toEqual({ trackCount: 1, albumCount: 1 })
  writeFileSync(join(cache, key('a')), 'old')
  writeFileSync(join(cache, key('b')), 'new')
  expect(state.albums.hasUnusedAlbums()).toBe(true)
  expect((await collector.collectGarbage()).orphanFileCount).toBe(1)
  expect(db.prepare('SELECT title FROM albums').pluck().all()).toEqual(['New album'])
  expect(existsSync(join(cache, key('a')))).toBe(false)
  expect(existsSync(join(cache, key('b')))).toBe(true)
  const id = tracks.getAll()[0].id
  tracks.markMissingByFilePaths([original.filePath])
  expect(stats.getStats()).toEqual({ trackCount: 1, albumCount: 0 })
  expect(
    db.transaction(() => new MissingTrackCleanupRepository(db).removeConfirmedMissing(root))(),
  ).toEqual([id])
  expect(stats.getStats()).toEqual({ trackCount: 0, albumCount: 0 })
  await collector.collectGarbage()
  expect(db.prepare('SELECT * FROM albums').all()).toEqual([])
  expect(existsSync(join(cache, key('b')))).toBe(true)
  expect(db.prepare('SELECT artwork_cache_key FROM removed_track_history').pluck().all()).toEqual([
    key('b'),
  ])
})

it('repairs existing current-format orphan rows during normal startup maintenance', async () => {
  const { root, cache, db, tracks, collector } = setup()
  tracks.upsertMany([scanned(join(root, 'song.flac'), 'Current')])
  db.prepare('INSERT INTO albums(title,artist,artwork_cache_key) VALUES(?,?,?)').run(
    'Obsolete',
    'Artist',
    key('b'),
  )
  writeFileSync(join(cache, key('a')), 'current')
  writeFileSync(join(cache, key('b')), 'obsolete')
  const migration = new ArtworkCacheMigrationService(db, cache)
  expect(migration.hasLegacyKeys()).toBe(false)
  await new ArtworkCacheMaintenanceService(migration, collector, {
    isScanActive: () => false,
    isRefreshActive: () => false,
    isImportActive: () => false,
  }).runStartupMaintenance()
  expect(db.prepare('SELECT title FROM albums').pluck().all()).toEqual(['Current'])
  expect(existsSync(join(cache, key('a')))).toBe(true)
  expect(existsSync(join(cache, key('b')))).toBe(false)
})

it('keeps an old album with another track and preserves raw and effective fallback identities', async () => {
  const { root, cache, db, tracks, stats, collector } = setup()
  const first = scanned(join(root, 'first.flac'), 'Raw')
  tracks.upsertMany([first, { ...first, filePath: join(root, 'second.flac') }])
  tracks.upsertMany([{ ...first, album: 'Renamed', artworkCacheKey: key('b') }])
  const id = tracks.getAll().find((item) => item.album === 'Renamed')!.id
  db.prepare(
    `INSERT INTO track_metadata(track_id,album_title,album_artist_display,source)
    VALUES(?,?,?,'user_edit')`,
  ).run(id, 'Override', 'Artist')
  db.prepare('INSERT INTO albums(title,artist,artwork_cache_key) VALUES(?,?,?)').run(
    'Override',
    'Artist',
    key('c'),
  )
  for (const seed of ['a', 'b', 'c']) writeFileSync(join(cache, key(seed)), seed)
  expect(stats.getStats()).toEqual({ trackCount: 2, albumCount: 2 })
  expect((await collector.collectGarbage()).orphanFileCount).toBe(0)
  expect(db.prepare('SELECT title FROM albums ORDER BY title').pluck().all()).toEqual([
    'Override',
    'Raw',
    'Renamed',
  ])
  expect(tracks.getAll().find((item) => item.id === id)?.artworkCacheKey).toBe(key('c'))
  db.prepare('DELETE FROM track_metadata WHERE track_id=?').run(id)
  expect(tracks.getAll().find((item) => item.id === id)?.artworkCacheKey).toBe(key('b'))
})

it('keeps missing tracks and SQL-null artist identities available for recovery', async () => {
  const { db, albums } = setup()
  db.exec(`INSERT INTO tracks(file_path,album,availability) VALUES('missing.flac','Album','missing');
    INSERT INTO albums(title,artist) VALUES('Album',NULL)`)
  expect(albums.hasUnusedAlbums()).toBe(false)
  expect(albums.removeUnusedAlbums()).toBe(0)
  expect(db.prepare('SELECT COUNT(*) FROM albums').pluck().get()).toBe(1)
})

it('uses field-level metadata fallbacks and artist fallback when album artist is empty', () => {
  const { db, albums } = setup()
  db.exec(`INSERT INTO tracks(id,file_path,album,artist,album_artist) VALUES(1,'a.flac','Raw','Raw artist','');
    INSERT INTO track_metadata(track_id,album_title,artist_display,album_artist_display,source)
    VALUES(1,'Override','Display artist','','user_edit');
    INSERT INTO albums(title,artist) VALUES('Raw','Raw artist'),('Override','Display artist'),('Unused','Artist')`)
  expect(albums.removeUnusedAlbums()).toBe(1)
  expect(db.prepare('SELECT title FROM albums ORDER BY title').pluck().all()).toEqual([
    'Override',
    'Raw',
  ])
})

it('matches same-title albums by both title and artist without scanning all namesakes', () => {
  const { db, albums } = setup()
  const track = db.prepare('INSERT INTO tracks(file_path,album,artist) VALUES(?,?,?)')
  const album = db.prepare('INSERT INTO albums(title,artist) VALUES(?,?)')
  const artists: Array<string | null> = ['001', '1', '', null]
  for (let i = 0; i < 4_000; i++) artists.push(`Artist ${i}`)
  db.transaction(() => {
    for (const [index, artist] of artists.entries()) {
      track.run(`synthetic-${index}.flac`, 'Greatest Hits', artist)
      album.run('Greatest Hits', artist)
    }
    album.run('Greatest Hits', '01')
  })()
  const statements = vi.spyOn(db, 'prepare')
  try {
    expect(albums.hasUnusedAlbums()).toBe(true)
    expect(albums.removeUnusedAlbums()).toBe(1)
    const queries = statements.mock.calls.map(([sql]) => sql)
    // Check the real statements' plans rather than a machine-dependent deadline.
    for (const query of queries) {
      const plan = db.prepare(`EXPLAIN QUERY PLAN ${query}`).all() as Array<{ detail: string }>
      expect(plan.some(({ detail }) => /SEARCH referenced.*title=\?.*artist=\?/.test(detail))).toBe(
        true,
      )
    }
  } finally {
    statements.mockRestore()
  }
  expect(albums.hasUnusedAlbums()).toBe(false)
  expect(db.prepare('SELECT COUNT(*) FROM albums').pluck().get()).toBe(artists.length)
})

it('preserves artwork owned directly by metadata and removed history after pruning album rows', async () => {
  const { root, cache, db, tracks, collector } = setup()
  tracks.upsertMany([scanned(join(root, 'song.flac'), 'Current')])
  const id = tracks.getAll()[0].id
  db.prepare(
    "INSERT INTO track_metadata(track_id,artwork_cache_key,source) VALUES(?,?,'user_edit')",
  ).run(id, key('b'))
  db.prepare(
    'INSERT INTO removed_track_history(id,title,artwork_cache_key,source_file_path,recovery_json) VALUES(?,?,?,?,?)',
  ).run(99, 'Removed', key('c'), 'removed.flac', '{}')
  db.prepare('INSERT INTO albums(title,artist,artwork_cache_key) VALUES(?,?,?)').run(
    'Unused metadata',
    'Artist',
    key('b'),
  )
  db.prepare('INSERT INTO albums(title,artist,artwork_cache_key) VALUES(?,?,?)').run(
    'Unused history',
    'Artist',
    key('c'),
  )
  for (const seed of ['a', 'b', 'c']) writeFileSync(join(cache, key(seed)), seed)
  expect((await collector.collectGarbage()).orphanFileCount).toBe(0)
  expect(db.prepare('SELECT title FROM albums').pluck().all()).toEqual(['Current'])
  for (const seed of ['a', 'b', 'c']) expect(existsSync(join(cache, key(seed)))).toBe(true)
})

it('does not prune album rows or files when maintenance is denied', async () => {
  const { cache, db, collector } = setup()
  db.prepare('INSERT INTO albums(title,artist,artwork_cache_key) VALUES(?,?,?)').run(
    'Unused',
    'Artist',
    key('a'),
  )
  writeFileSync(join(cache, key('a')), 'preserve')
  await collector.collectGarbage(() => false)
  expect(db.prepare('SELECT COUNT(*) FROM albums').pluck().get()).toBe(1)
  expect(existsSync(join(cache, key('a')))).toBe(true)
})

it('rolls back all album pruning before touching cache files if a row deletion fails', async () => {
  const { cache, db, collector } = setup()
  db.prepare('INSERT INTO albums(title,artist,artwork_cache_key) VALUES(?,?,?)').run(
    'One',
    'Artist',
    key('a'),
  )
  db.prepare('INSERT INTO albums(title,artist,artwork_cache_key) VALUES(?,?,?)').run(
    'Two',
    'Artist',
    key('b'),
  )
  for (const seed of ['a', 'b']) writeFileSync(join(cache, key(seed)), seed)
  db.exec(
    "CREATE TRIGGER deny_album_delete BEFORE DELETE ON albums WHEN OLD.title='Two' BEGIN SELECT RAISE(ABORT,'denied'); END",
  )
  await expect(collector.collectGarbage()).rejects.toThrow('denied')
  expect(db.prepare('SELECT COUNT(*) FROM albums').pluck().get()).toBe(2)
  for (const seed of ['a', 'b']) expect(existsSync(join(cache, key(seed)))).toBe(true)
  expect(collector.isRunning()).toBe(false)
})

it('counts the album browser groups including overrides, unknown values and missing tracks', () => {
  const { db, stats } = setup()
  const insert = db.prepare(
    'INSERT INTO tracks(file_path,album,artist,album_artist,availability) VALUES(?,?,?,?,?)',
  )
  insert.run('a.flac', null, null, null, 'available')
  insert.run('b.flac', '', '', '', 'available')
  insert.run('c.flac', 'Album', 'Artist', '', 'available')
  insert.run('d.flac', 'Album', 'Artist', null, 'available')
  insert.run('e.flac', 'Hidden', 'Artist', 'Artist', 'missing')
  insert.run('f.flac', 'Raw', 'Artist', 'Artist', 'available')
  const id = db.prepare("SELECT id FROM tracks WHERE file_path='f.flac'").pluck().get()
  db.prepare(
    "INSERT INTO track_metadata(track_id,album_title,album_artist_display,source) VALUES(?,?,?,'user_edit')",
  ).run(id, 'Override', 'Different')
  db.exec("INSERT INTO albums(title,artist) VALUES('Not in the browser','Artist')")
  expect(stats.getStats()).toEqual({
    trackCount: 6,
    albumCount: 3,
  })
  expect(stats.getStats().albumCount).toBe(3)
  const returned = stats.getStats()
  returned.albumCount = 999
  expect(stats.getStats().albumCount).toBe(3)
})

it('invalidates cached counts after a writer connection changes effective album metadata', () => {
  const { dbPath, db, stats } = setup(true)
  db.exec(
    "INSERT INTO tracks(file_path,album,artist) VALUES('a.flac','A','Artist'),('b.flac','A','Artist')",
  )
  expect(stats.getStats().albumCount).toBe(1)
  const writer = new DatabaseCtor(dbPath)
  databases.push(writer)
  writer.exec("UPDATE tracks SET album='B' WHERE file_path='b.flac'")
  expect(stats.getStats().albumCount).toBe(2)
  writer.exec("UPDATE tracks SET availability='missing' WHERE file_path='b.flac'")
  expect(stats.getStats()).toEqual({ trackCount: 2, albumCount: 1 })
})

it('does not reuse statistics from a rolled-back caller transaction with the same revision', () => {
  const { db, stats } = setup()
  db.exec("INSERT INTO tracks(file_path,album) VALUES('a.flac','A')")
  expect(stats.getStats()).toEqual({ trackCount: 1, albumCount: 1 })
  expect(() =>
    db.transaction(() => {
      db.exec("INSERT INTO tracks(file_path,album) VALUES('b.flac','B')")
      expect(stats.getStats()).toEqual({ trackCount: 2, albumCount: 2 })
      throw new Error('rollback')
    })(),
  ).toThrow('rollback')
  db.transaction(() => {
    db.exec('DELETE FROM tracks')
    expect(stats.getStats()).toEqual({ trackCount: 0, albumCount: 0 })
  })()
  expect(stats.getStats()).toEqual({ trackCount: 0, albumCount: 0 })
})
