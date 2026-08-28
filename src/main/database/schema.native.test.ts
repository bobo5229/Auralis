import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateDatabase } from './schema'

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
      Array.from({ length: 20 }, (_, index) => index + 1),
    )
    expect(migrations.at(-1)?.name).toBe('add_regular_playlists')
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
    expect(db.prepare('SELECT COUNT(*) FROM schema_migrations').pluck().get()).toBe(20)
  })
})
