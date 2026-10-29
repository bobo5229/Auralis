import { createRequire } from 'node:module'
import type Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from '@main/database/schema'
import { TrackRepository } from '@main/repositories/trackRepository'
import { LibraryCatalogSnapshotStore } from './libraryCatalogSnapshotStore'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database

describe('artist index catalog integration', () => {
  it('sorts and pages fallback artists while preserving existing album identity', () => {
    const db = new DatabaseCtor(':memory:')
    try {
      migrateDatabase(db)
      db.exec(`INSERT INTO tracks(id,file_path,title,artist,album,album_artist) VALUES
        (1,'one.flac','One','周杰伦','Album',' '),
        (2,'two.flac','Two','Adele','Album','Adele'),
        (3,'three.flac','Three','2PM','Album','2PM')`)
      const repository = new TrackRepository(db)
      const store = new LibraryCatalogSnapshotStore(
        () => repository.getAll(),
        Date.now,
        () => repository.getChangeToken(),
      )
      const first = store.getPage({ refresh: true, limit: 2 })
      expect(first.tracks.map((track) => track.id)).toEqual([2, 1])
      expect(store.getPage({ cursor: first.nextCursor! }).tracks.map((track) => track.id)).toEqual([
        3,
      ])
      expect(repository.getAlbumDetailTracks(' ', 'Album').map((track) => track.id)).toEqual([1])
    } finally {
      db.close()
    }
  })
})
