import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import type { ScannedTrack } from '@shared/types/libraryScan'
import { migrateDatabase } from '../database/schema'
import { LibraryService } from '../services/libraryService'
import { LibraryRepository } from './libraryRepository'
import { TrackRepository } from './trackRepository'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
const databases: Database.Database[] = []

function setup() {
  const db = new DatabaseCtor(':memory:')
  databases.push(db)
  migrateDatabase(db)
  const tracks = new TrackRepository(db)
  return { db, tracks, service: new LibraryService(new LibraryRepository(db), tracks) }
}

function scanned(id: number, patch: Partial<ScannedTrack> = {}): ScannedTrack {
  return {
    filePath: `C:\\Music\\${id}.flac`,
    fileSize: 100,
    fileMtimeMs: 100,
    title: `Track ${id}`,
    artist: 'Artist',
    album: 'Current',
    albumArtist: 'Artist',
    trackNo: id,
    discNo: 1,
    durationSeconds: 180,
    year: 2020,
    releaseDate: '2020',
    copyright: null,
    composer: null,
    genre: 'Jazz; R&B/SOUL',
    artworkCacheKey: null,
    lyricsText: null,
    lyricsFormat: null,
    isrc: null,
    metadataSignature: `sig-${id}`,
    ...patch,
  }
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})

describe('album genre recommendations', () => {
  it('matches any complete genre across album tracks, deduplicates and excludes missing files/current album', () => {
    const { db, tracks, service } = setup()
    tracks.upsertMany([
      scanned(1),
      scanned(2, { albumArtist: 'Other', album: 'Match', genre: 'jazz' }),
      scanned(3, { albumArtist: 'Other', album: 'Match', genre: 'R&B/SOUL' }),
      scanned(4, { albumArtist: 'Other', album: 'Atomic', genre: 'R&B/SOUL' }),
      scanned(5, { albumArtist: 'Other', album: 'No partial match', genre: 'SOUL' }),
      scanned(6, { albumArtist: 'Other', album: 'Missing genre', genre: null }),
      scanned(7, { albumArtist: 'Other', album: 'Missing file' }),
      scanned(8, { albumArtist: 'Other', album: 'Current', genre: 'Jazz' }),
    ])
    db.prepare("UPDATE tracks SET availability = 'missing' WHERE file_path = ?").run(
      'C:\\Music\\7.flac',
    )
    const detail = service.getAlbumDetail({ albumArtist: 'Artist', albumTitle: 'Current' })
    expect(detail.moreAlbums).toEqual([])
    expect(detail.genreAlbums.map((album) => album.title).sort()).toEqual([
      'Atomic',
      'Current',
      'Match',
    ])
    expect(detail.genreAlbums.every((album) => album.albumArtist === 'Other')).toBe(true)
  })

  it('prefers same-artist albums and returns no genre fallback when genre metadata is absent', () => {
    const { tracks, service } = setup()
    tracks.upsertMany([
      scanned(1),
      scanned(2, { album: 'Sibling' }),
      scanned(3, { albumArtist: 'Other', album: 'Genre match' }),
      scanned(4, { albumArtist: 'No genre artist', album: 'No genre', genre: null }),
    ])
    const detail = service.getAlbumDetail({ albumArtist: 'Artist', albumTitle: 'Current' })
    expect(detail.moreAlbums.map((album) => album.title)).toEqual(['Sibling'])
    expect(detail.genreAlbums).toEqual([])
    expect(
      service.getAlbumDetail({ albumArtist: 'No genre artist', albumTitle: 'No genre' })
        .genreAlbums,
    ).toEqual([])
    expect(
      service.getAlbumDetail({ albumArtist: 'Absent', albumTitle: 'Absent' }).genreAlbums,
    ).toEqual([])
  })
})
