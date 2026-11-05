import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateDatabase } from '../database/schema'
import { selectArtworkAlbumCandidate } from './trackArtworkProjection'
import { refreshArtworkAlbum } from './trackArtworkProjection'

const nodeRequire = createRequire(import.meta.url)
const DatabaseCtor = nodeRequire('better-sqlite3') as unknown as new (
  path: string,
) => Database.Database

const databases: Database.Database[] = []

function createDatabase(): Database.Database {
  const db = new DatabaseCtor(':memory:')
  databases.push(db)
  migrateDatabase(db)
  return db
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})

describe('shared artwork candidate selection', () => {
  it('keeps fallback previews and album projection in the same order, excluding only the edited track', () => {
    const db = createDatabase()
    db.exec(`
      INSERT INTO tracks(id,file_path,album,album_artist,disc_no,track_no,embedded_artwork_cache_key,directory_artwork_cache_key,availability) VALUES
      (1,'current.flac','Album','Artist',1,1,'current',NULL,'available'),
      (2,'missing.flac','Album','Artist',1,1,'missing',NULL,'missing'),
      (3,'other-album.flac','Other','Artist',1,1,'other-album',NULL,'available'),
      (4,'other-artist.flac','Album','Other',1,1,'other-artist',NULL,'available'),
      (5,'disc-two.flac','Album','Artist',2,1,'disc-two',NULL,'available'),
      (6,'unnumbered.flac','Album','Artist',1,NULL,'unnumbered',NULL,'available'),
      (7,'directory.flac','Album','Artist',1,2,NULL,'directory','available'),
      (8,'same-number.flac','Album','Artist',1,2,'same-number',NULL,'available');
      UPDATE tracks SET embedded_artwork_checked_fingerprint='checked',effective_album_title=album,effective_album_artist=album_artist;
    `)
    const fallback = (id: number) => {
      const identity = db
        .prepare(
          'SELECT effective_album_title AS album,effective_album_artist AS artist FROM tracks WHERE id=?',
        )
        .get(id) as { album: string; artist: string } | undefined
      return identity ? selectArtworkAlbumCandidate(db, identity, id) : null
    }
    const identity = { album: 'Album', artist: 'Artist' }
    const projected = () => {
      refreshArtworkAlbum(db, identity)
      return (
        db
          .prepare('SELECT artwork_cache_key AS key FROM albums WHERE title=? AND artist=?')
          .get(identity.album, identity.artist) as { key: string | null }
      ).key
    }
    expect(fallback(1)).toBe('directory')
    expect(projected()).toBe('current')
    db.exec('UPDATE tracks SET embedded_artwork_cache_key=NULL WHERE id=1')
    expect(fallback(1)).toBe('directory')
    expect(projected()).toBe('directory')
    db.exec("UPDATE tracks SET embedded_artwork_cache_key='embedded' WHERE id=7")
    expect(fallback(1)).toBe('embedded')
    expect(projected()).toBe('embedded')
    db.exec("UPDATE tracks SET availability='missing' WHERE id=7")
    expect(fallback(1)).toBe('same-number')
    expect(projected()).toBe('same-number')
    expect(fallback(999)).toBeNull()
    db.exec("UPDATE tracks SET availability='missing' WHERE id IN (5,6,8)")
    expect(fallback(1)).toBeNull()
    expect(projected()).toBeNull()
  })
})
