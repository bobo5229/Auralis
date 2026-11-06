import { createRequire } from 'node:module'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from './schema'
import { migrations } from './schemaMigrations'
import {
  refreshArtworkAlbum,
  selectArtworkAlbumCandidate,
} from '../repositories/trackArtworkProjection'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as typeof Database
let directory: string
const connections: Database.Database[] = []

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'auralis-artwork-index-migration-'))
})
afterEach(() => {
  for (const db of connections.splice(0).reverse()) if (db.open) db.close()
  if (
    resolve(dirname(directory)) !== resolve(tmpdir()) ||
    !basename(directory).startsWith('auralis-artwork-index-migration-')
  )
    throw new Error('Unsafe migration fixture cleanup')
  rmSync(directory, { recursive: true, force: true })
})
function open(path: string): Database.Database {
  const db = new DatabaseCtor(path)
  connections.push(db)
  return db
}
function oldDatabase() {
  const path = join(directory, 'library.sqlite')
  const backups = join(directory, 'backups')
  const db = open(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(
    'CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  )
  db.transaction(() => {
    for (const migration of migrations.filter((item) => item.id <= 34)) {
      db.exec(migration.sql)
      db.prepare('INSERT INTO schema_migrations(id,name) VALUES(?,?)').run(
        migration.id,
        migration.name,
      )
    }
  })()
  db.exec(`
    INSERT INTO tracks(id,file_path,title,artist,album,album_artist,lyrics_text,lyrics_format,
      effective_album_title,effective_album_artist,embedded_artwork_cache_key,embedded_artwork_checked_fingerprint)
    VALUES (7,'isolated.flac','Song','Artist','Album','Artist','[00:00]Lyric','lrc','Album','Artist','cover.webp','fingerprint');
    INSERT INTO track_metadata(track_id,lyrics_text,lyrics_format,source) VALUES(7,'[00:00]Lyric','lrc','file_tag');
    INSERT INTO albums(title,artist,artwork_cache_key) VALUES('Album','Artist','cover.webp');
    INSERT INTO track_play_stats(track_id,play_count) VALUES(7,11);
    INSERT INTO daily_track_play_stats(play_date,track_id,play_count,duration_seconds) VALUES('2026-11-01',7,3,180);
    INSERT INTO playlists(id,name) VALUES(2,'Favorites');
    INSERT INTO playlist_tracks(playlist_id,track_id,position) VALUES(2,7,0);
    INSERT INTO removed_track_history(id,source_file_path,recovery_json) VALUES(40,'gone.flac','{}');
  `)
  return { db, path, backups }
}
const tables = [
  'tracks',
  'track_metadata',
  'albums',
  'track_play_stats',
  'daily_track_play_stats',
  'playlists',
  'playlist_tracks',
  'removed_track_history',
  'library_catalog_revision',
]
function snapshot(db: Database.Database) {
  return Object.fromEntries(
    tables.map((table) => [table, db.prepare(`SELECT * FROM ${table}`).all()]),
  )
}
function indexes(db: Database.Database): string[] {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_tracks_album_artwork_%' ORDER BY name",
    )
    .pluck()
    .all() as string[]
}
const candidateSql = `SELECT COALESCE(t.embedded_artwork_cache_key,t.directory_artwork_cache_key) AS key
  FROM tracks t WHERE t.effective_album_title=? AND t.effective_album_artist=?
  AND t.availability='available' AND COALESCE(t.embedded_artwork_cache_key,t.directory_artwork_cache_key) IS NOT NULL
  ORDER BY COALESCE(t.disc_no,1), t.track_no IS NULL, t.track_no, t.id LIMIT 1`
const pendingSql = `SELECT 1 FROM tracks t WHERE t.effective_album_title=? AND t.effective_album_artist=?
  AND t.availability='available' AND t.embedded_artwork_checked_fingerprint IS NULL LIMIT 1`
function plan(db: Database.Database, sql: string): string[] {
  return (
    db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all('Album', 'Artist') as Array<{ detail: string }>
  ).map((row) => row.detail)
}

describe('album artwork projection index migration', () => {
  it('backs up a populated version 34 database and upgrades it without changing data or relationships', () => {
    const { db, path, backups } = oldDatabase()
    const before = snapshot(db)
    expect(db.prepare('SELECT MAX(id) FROM schema_migrations').pluck().get()).toBe(34)
    migrateDatabase(db, path, backups)
    expect(snapshot(db)).toEqual(before)
    expect(db.pragma('foreign_key_check')).toEqual([])
    expect(indexes(db)).toEqual([
      'idx_tracks_album_artwork_candidate',
      'idx_tracks_album_artwork_pending',
    ])
    expect(db.prepare('SELECT COUNT(*) FROM schema_migrations WHERE id=35').pluck().get()).toBe(1)
    const files = readdirSync(backups).filter((file) => /^pre-migration-v35-.*\.backup$/.test(file))
    expect(files).toHaveLength(1)
    const backup = open(join(backups, files[0]))
    expect(snapshot(backup)).toEqual(before)
    expect(backup.prepare('SELECT MAX(id) FROM schema_migrations').pluck().get()).toBe(34)
    expect(indexes(backup)).toEqual([])
    expect(backup.pragma('quick_check', { simple: true })).toBe('ok')
    migrateDatabase(db, path, backups)
    expect(snapshot(db)).toEqual(before)
    expect(readdirSync(backups).filter((file) => file.endsWith('.backup'))).toHaveLength(1)
    expect(db.prepare('SELECT COUNT(*) FROM schema_migrations WHERE id=35').pluck().get()).toBe(1)
  })

  it('rolls back the first index and migration record when creation of the second index fails', () => {
    const { db, path, backups } = oldDatabase()
    db.exec('CREATE INDEX idx_tracks_album_artwork_pending ON tracks(title)')
    const before = snapshot(db)
    expect(() => migrateDatabase(db, path, backups)).toThrow()
    expect(snapshot(db)).toEqual(before)
    expect(indexes(db)).toEqual(['idx_tracks_album_artwork_pending'])
    expect(db.prepare('SELECT COUNT(*) FROM schema_migrations WHERE id=35').pluck().get()).toBe(0)
    expect(
      readdirSync(backups).filter((file) => /^pre-migration-v35-.*\.backup$/.test(file)),
    ).toHaveLength(1)
    expect(db.pragma('foreign_key_check')).toEqual([])
    db.exec('DROP INDEX idx_tracks_album_artwork_pending')
    migrateDatabase(db, path, backups)
    expect(indexes(db)).toEqual([
      'idx_tracks_album_artwork_candidate',
      'idx_tracks_album_artwork_pending',
    ])
    expect(snapshot(db)).toEqual(before)
  })

  it('uses both indexes and maintains selection while pending state, artwork and availability change', () => {
    const db = open(':memory:')
    db.pragma('foreign_keys = ON')
    migrateDatabase(db)
    expect(plan(db, candidateSql).join(' ')).toContain('idx_tracks_album_artwork_candidate')
    expect(plan(db, candidateSql).join(' ')).not.toContain('TEMP B-TREE')
    expect(plan(db, pendingSql).join(' ')).toContain('idx_tracks_album_artwork_pending')
    const insert =
      db.prepare(`INSERT INTO tracks(id,file_path,effective_album_title,effective_album_artist,
      availability,disc_no,track_no,embedded_artwork_cache_key,directory_artwork_cache_key,embedded_artwork_checked_fingerprint)
      VALUES(?,?,?,?,?,?,?,?,?,?)`)
    insert.run(1, 'one', 'Album', 'Artist', 'available', 1, 1, null, null, null)
    insert.run(2, 'two', 'Album', 'Artist', 'available', 1, 2, null, null, 'fp')
    insert.run(3, 'three', 'Album', 'Artist', 'missing', 1, 0, null, 'missing', 'fp')
    db.prepare(
      "INSERT INTO albums(title,artist,artwork_cache_key) VALUES('Album','Artist','old')",
    ).run()
    const identity = { album: 'Album', artist: 'Artist' }
    const observe = () => {
      refreshArtworkAlbum(db, identity)
      return {
        candidate: selectArtworkAlbumCandidate(db, identity),
        excludingFirst: selectArtworkAlbumCandidate(db, identity, 1),
        pending: Boolean(db.prepare(pendingSql).get('Album', 'Artist')),
        key: (
          db
            .prepare(
              "SELECT artwork_cache_key AS key FROM albums WHERE title='Album' AND artist='Artist'",
            )
            .get() as { key: string | null }
        ).key,
      }
    }
    expect(observe()).toEqual({ candidate: null, excludingFirst: null, pending: true, key: 'old' })
    db.prepare("UPDATE tracks SET embedded_artwork_checked_fingerprint='fp' WHERE id=1").run()
    expect(observe()).toEqual({ candidate: null, excludingFirst: null, pending: false, key: null })
    db.prepare("UPDATE tracks SET directory_artwork_cache_key='directory' WHERE id=2").run()
    expect(observe()).toEqual({
      candidate: 'directory',
      excludingFirst: 'directory',
      pending: false,
      key: 'directory',
    })
    db.prepare("UPDATE tracks SET embedded_artwork_cache_key='embedded' WHERE id=1").run()
    expect(observe()).toEqual({
      candidate: 'embedded',
      excludingFirst: 'directory',
      pending: false,
      key: 'embedded',
    })
    db.prepare("UPDATE tracks SET availability='missing' WHERE id=1").run()
    expect(observe().candidate).toBe('directory')
    db.prepare("UPDATE tracks SET availability='available' WHERE id=1").run()
    expect(observe().candidate).toBe('embedded')
    db.prepare('UPDATE tracks SET embedded_artwork_cache_key=NULL WHERE id=1').run()
    expect(observe().candidate).toBe('directory')
    db.prepare('UPDATE tracks SET directory_artwork_cache_key=NULL WHERE id=2').run()
    expect(observe()).toEqual({ candidate: null, excludingFirst: null, pending: false, key: null })
    db.prepare('UPDATE tracks SET embedded_artwork_checked_fingerprint=NULL WHERE id=2').run()
    db.prepare("UPDATE albums SET artwork_cache_key='old2' WHERE title='Album'").run()
    expect(observe()).toEqual({ candidate: null, excludingFirst: null, pending: true, key: 'old2' })
    db.prepare("UPDATE tracks SET availability='missing' WHERE id=2").run()
    expect(observe()).toEqual({ candidate: null, excludingFirst: null, pending: false, key: null })
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok')
  })
})
