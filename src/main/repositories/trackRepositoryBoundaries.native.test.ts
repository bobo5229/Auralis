import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import type { ScannedTrack } from '@shared/types/libraryScan'
import { migrateDatabase } from '../database/schema'
import { TrackRepository } from './trackRepository'

const nodeRequire = createRequire(import.meta.url)
const DatabaseCtor = nodeRequire('better-sqlite3') as new (path: string) => Database.Database
const databases: Database.Database[] = []

function setup() {
  const db = new DatabaseCtor(':memory:')
  databases.push(db)
  // Construction remains valid before schema preparation.
  const repository = new TrackRepository(db)
  migrateDatabase(db)
  return { db, repository }
}

function track(filePath: string, title = 'Song'): ScannedTrack {
  return {
    filePath,
    title,
    fileSize: 100,
    fileMtimeMs: 1,
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    trackNo: null,
    discNo: null,
    durationSeconds: 180,
    year: null,
    releaseDate: null,
    copyright: null,
    composer: null,
    genre: null,
    artworkCacheKey: null,
    lyricsText: null,
    lyricsFormat: null,
    isrc: null,
    metadataSignature: 'test',
  }
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})

describe('track repository component boundaries', () => {
  it.each(['direct', 'outer transaction'] as const)(
    'preserves 300-row batch commit behavior in %s',
    (mode) => {
      const { db, repository } = setup()
      db.exec(`CREATE TRIGGER reject_bad_track BEFORE INSERT ON tracks
        WHEN NEW.title = 'Bad' BEGIN SELECT RAISE(ABORT, 'batch failure'); END`)
      const tracks = Array.from({ length: 301 }, (_, index) =>
        track(`C:\\isolated\\${index}.flac`, index === 300 ? 'Bad' : 'Song'),
      )
      const write = () => repository.upsertMany(tracks)
      expect(mode === 'direct' ? write : db.transaction(write)).toThrow('batch failure')
      expect(db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(
        mode === 'direct' ? 300 : 0,
      )
      expect(db.prepare('SELECT COUNT(*) FROM albums').pluck().get()).toBe(
        mode === 'direct' ? 1 : 0,
      )
      expect(repository.getExistingFilePaths(tracks.map((item) => item.filePath)).size).toBe(
        mode === 'direct' ? 300 : 0,
      )
      expect(db.inTransaction).toBe(false)
    },
  )

  it('handles Windows path aliases and escaped root patterns without marking unreadable or adjacent roots missing', () => {
    const { db, repository } = setup()
    const root = 'C:\\isolated%_~'
    const found = `${root}\\found.flac`
    const gone = `${root}\\gone.flac`
    const protectedPath = `${root}\\unreadable\\protected.flac`
    const sibling = 'C:\\isolatedXY~\\sibling.flac'
    repository.upsertMany([found, gone, protectedPath, sibling].map((path) => track(path)))
    const id = repository.getTrackIdsByFilePaths([gone])[0]
    expect(
      repository.markMissingUnderRootExcept(
        root,
        [found.replace(/\\/g, '/')],
        [`${root}\\unreadable`],
      ),
    ).toEqual([id])
    expect(
      db.prepare('SELECT file_path AS path FROM tracks WHERE availability = ?').all('missing'),
    ).toEqual([{ path: gone }])
    expect(repository.getMissingCandidates().map((item) => item.trackId)).toEqual([id])
    expect(repository.markAvailableByFilePaths([gone])).toEqual([id])
    expect(repository.getMissingCandidates()).toEqual([])
    expect(
      db.prepare("SELECT name FROM sqlite_temp_master WHERE name='_temp_found_paths'").all(),
    ).toEqual([])
  })
})
