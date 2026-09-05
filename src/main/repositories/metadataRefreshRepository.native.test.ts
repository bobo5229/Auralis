import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateDatabase } from '../database/schema'
import { MetadataRefreshRepository } from './metadataRefreshRepository'

const nodeRequire = createRequire(import.meta.url)
const DatabaseCtor = nodeRequire('better-sqlite3') as unknown as new (
  path: string,
) => Database.Database

const databases: Database.Database[] = []
const ARTWORK_KEY = `v2-${'ab'.repeat(32)}.webp`

function createDatabase(): Database.Database {
  const db = new DatabaseCtor(':memory:')
  databases.push(db)
  migrateDatabase(db)
  return db
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})

function displayArtwork(db: Database.Database, trackId: number): string | null {
  const row = db
    .prepare(`SELECT artwork_cache_key AS k FROM library_track_display WHERE id = ?`)
    .get(trackId) as { k: string | null } | undefined
  return row?.k ?? null
}

describe('updateUserEditedMetadata artwork', () => {
  it('keeps album artwork visible after a genre-only user edit', () => {
    const db = createDatabase()
    db.prepare(
      `INSERT INTO tracks (id, file_path, title, artist, album, album_artist)
       VALUES (1, 'C:\\Music\\a.flac', 'Title', 'Artist', 'Album', 'Album Artist')`,
    ).run()
    db.prepare(
      `INSERT INTO albums (title, artist, artwork_cache_key) VALUES ('Album', 'Album Artist', ?)`,
    ).run(ARTWORK_KEY)

    expect(displayArtwork(db, 1)).toBe(ARTWORK_KEY)

    const repo = new MetadataRefreshRepository(db)
    repo.updateUserEditedMetadata({
      trackId: 1,
      title: 'Title',
      artistDisplay: 'Artist',
      albumTitle: 'Album',
      albumArtistDisplay: 'Album Artist',
      genreDisplay: 'Cantopop',
      year: 2003,
      releaseDate: '2003-01-01',
    })

    expect(displayArtwork(db, 1)).toBe(ARTWORK_KEY)
    const stored = db
      .prepare(`SELECT artwork_cache_key AS k FROM track_metadata WHERE track_id = 1`)
      .get() as { k: string | null }
    expect(stored.k).toBe(ARTWORK_KEY)
  })

  it('still displays artwork when album artist is missing and albums.artist is the track artist', () => {
    const db = createDatabase()
    db.prepare(
      `INSERT INTO tracks (id, file_path, title, artist, album, album_artist)
       VALUES (1, 'C:\\Music\\b.flac', 'Title', 'Artist', 'Album', NULL)`,
    ).run()
    db.prepare(
      `INSERT INTO albums (title, artist, artwork_cache_key) VALUES ('Album', 'Artist', ?)`,
    ).run(ARTWORK_KEY)

    expect(displayArtwork(db, 1)).toBe(ARTWORK_KEY)

    const repo = new MetadataRefreshRepository(db)
    repo.updateUserEditedMetadata({
      trackId: 1,
      title: 'Title',
      artistDisplay: 'Artist',
      albumTitle: 'Album',
      albumArtistDisplay: null,
      genreDisplay: 'Pop',
      year: null,
      releaseDate: null,
    })

    expect(displayArtwork(db, 1)).toBe(ARTWORK_KEY)
  })
})
