import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateDatabase } from './schema'
import { migrations } from './schemaMigrations'

const nodeRequire = createRequire(import.meta.url)
const DatabaseCtor = nodeRequire('better-sqlite3') as unknown as new (
  path: string,
) => Database.Database

const databases: Database.Database[] = []

function createDatabase(): Database.Database {
  const db = new DatabaseCtor(':memory:')
  databases.push(db)
  return db
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})

describe('migrateDatabase', () => {
  it('adds history storage to migration 23 without changing existing music or statistics', () => {
    const db = createDatabase()
    db.exec(
      'CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    )
    for (const migration of migrations.slice(0, 23)) {
      db.exec(migration.sql)
      db.prepare('INSERT INTO schema_migrations(id,name) VALUES(?,?)').run(
        migration.id,
        migration.name,
      )
    }
    db.exec(
      "INSERT INTO tracks(id,file_path,title,genre) VALUES(5,'old.flac','Song','Pop'); INSERT INTO track_play_stats(track_id,play_count) VALUES(5,7); INSERT INTO daily_track_play_stats(play_date,track_id,play_count,duration_seconds) VALUES('2026-10-03',5,7,700)",
    )
    const before = db.prepare('SELECT * FROM library_track_display').all()
    migrateDatabase(db)
    expect(db.prepare('SELECT * FROM library_track_display').all()).toEqual(before)
    expect(db.prepare('SELECT COUNT(*) FROM removed_track_history').pluck().get()).toBe(0)
    expect(db.prepare('SELECT * FROM listening_daily_track_play_stats').all()).toEqual(
      db.prepare('SELECT * FROM daily_track_play_stats').all(),
    )
    expect(db.pragma('foreign_key_check')).toEqual([])
  })

  it('creates the complete current schema and records every migration once', () => {
    const db = createDatabase()

    migrateDatabase(db)
    migrateDatabase(db)

    const migrations = db
      .prepare('SELECT id, name FROM schema_migrations ORDER BY id')
      .all() as Array<{ id: number; name: string }>
    const objects = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')")
      .pluck()
      .all() as string[]

    expect(migrations.map(({ id }) => id)).toEqual(
      Array.from({ length: 24 }, (_, index) => index + 1),
    )
    expect(migrations.at(-1)?.name).toBe('preserve_listening_history_after_track_removal')
    expect(objects).toEqual(
      expect.arrayContaining([
        'tracks',
        'albums',
        'library_roots',
        'scan_jobs',
        'metadata_refresh_jobs',
        'track_metadata',
        'track_play_stats',
        'daily_play_stats',
        'daily_track_play_stats',
        'smart_playlists',
        'playlists',
        'playlist_tracks',
        'library_track_display',
      ]),
    )
    expect(objects).not.toContain('file_tag_snapshots')
  })

  it('upgrades a migration-1 database without losing existing tracks', () => {
    const db = createDatabase()
    db.exec(`
      CREATE TABLE tracks (
        id INTEGER PRIMARY KEY,
        file_path TEXT NOT NULL UNIQUE,
        title TEXT,
        artist TEXT,
        album TEXT,
        duration_seconds REAL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE albums (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        artist TEXT,
        artwork_cache_key TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(title, artist)
      );
      CREATE INDEX idx_tracks_album ON tracks(album);
      CREATE INDEX idx_tracks_artist ON tracks(artist);
      CREATE TABLE schema_migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO schema_migrations (id, name) VALUES (1, 'initial_library_schema');
      INSERT INTO tracks (id, file_path, title, artist, album, duration_seconds)
      VALUES (7, 'C:\\Music\\legacy.flac', 'Legacy Track', 'Legacy Artist', 'Legacy Album', 240);
    `)

    migrateDatabase(db)

    const row = db
      .prepare(
        `SELECT id, title, availability, play_count AS playCount
         FROM library_track_display WHERE id = 7`,
      )
      .get() as { id: number; title: string; availability: string; playCount: number }

    expect(row).toEqual({
      id: 7,
      title: 'Legacy Track',
      availability: 'available',
      playCount: 0,
    })
    expect(db.prepare('SELECT COUNT(*) FROM schema_migrations').pluck().get()).toBe(24)
    expect(
      db.prepare('SELECT lyrics_sidecar_fingerprint FROM tracks WHERE id = 7').pluck().get(),
    ).toBeNull()
    expect(db.prepare('SELECT composer FROM tracks WHERE id = 7').pluck().get()).toBeNull()
  })

  it('adds composer and clears metadata fingerprints so existing tracks refresh', () => {
    const db = createDatabase()
    db.exec(`
      CREATE TABLE schema_migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)
    const insertMigration = db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)')
    for (const migration of migrations) {
      if (migration.id > 22) break
      db.exec(migration.sql)
      insertMigration.run(migration.id, migration.name)
    }
    db.prepare(
      `INSERT INTO tracks (id, file_path, title, metadata_checked_mtime_ms)
       VALUES (1, 'C:\\Music\\old.flac', 'Old', 12345)`,
    ).run()

    migrateDatabase(db)

    const row = db
      .prepare(
        `SELECT composer, metadata_checked_mtime_ms AS checked
         FROM tracks WHERE id = 1`,
      )
      .get() as { composer: string | null; checked: number | null }

    expect(row).toEqual({ composer: null, checked: null })
    expect(
      db.prepare('SELECT composer FROM library_track_display WHERE id = 1').pluck().get(),
    ).toBeNull()
  })
})
