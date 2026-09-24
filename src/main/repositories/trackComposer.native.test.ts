import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import type { ScannedTrack } from '@shared/types/libraryScan'
import { migrateDatabase } from '../database/schema'
import { TrackRepository } from './trackRepository'
import { MetadataRefreshRepository, type RefreshedTrackMetadata } from './metadataRefreshRepository'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database

const databases: Database.Database[] = []

function setup(): {
  db: Database.Database
  tracks: TrackRepository
  refresh: MetadataRefreshRepository
} {
  const db = new DatabaseCtor(':memory:')
  databases.push(db)
  migrateDatabase(db)
  return {
    db,
    tracks: new TrackRepository(db),
    refresh: new MetadataRefreshRepository(db),
  }
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})

function scanned(patch: Partial<ScannedTrack> = {}): ScannedTrack {
  return {
    filePath: 'C:\\Music\\song.flac',
    fileSize: 100,
    fileMtimeMs: 100,
    title: 'Song',
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    trackNo: 1,
    discNo: 1,
    durationSeconds: 180,
    year: 2020,
    releaseDate: '2020',
    copyright: null,
    composer: null,
    genre: null,
    artworkCacheKey: null,
    lyricsText: null,
    lyricsFormat: null,
    isrc: null,
    metadataSignature: 'sig',
    ...patch,
  }
}

function refreshed(
  trackId: number,
  filePath: string,
  patch: Partial<RefreshedTrackMetadata> = {},
): RefreshedTrackMetadata {
  return {
    trackId,
    sourceFilePath: filePath,
    fileSize: 120,
    fileMtimeMs: 200,
    title: 'Song',
    artistDisplay: 'Artist',
    artists: ['Artist'],
    artist: 'Artist',
    albumTitle: 'Album',
    album: 'Album',
    albumArtistDisplay: 'Artist',
    albumArtists: ['Artist'],
    albumArtist: 'Artist',
    trackNo: 1,
    discNo: 1,
    durationSeconds: 180,
    year: 2020,
    releaseDate: '2020',
    copyright: null,
    composer: null,
    genres: [],
    genre: null,
    lyricsText: null,
    lyricsFormat: null,
    artworkCacheKey: null,
    isrc: null,
    metadataSignature: 'sig',
    ...patch,
  }
}

describe('track composer persistence', () => {
  it('stores a single composer, multiple composers, and missing composer', () => {
    const { tracks } = setup()
    tracks.upsertMany([
      scanned({ filePath: 'C:\\Music\\one.flac', title: 'One', composer: 'Bach' }),
      scanned({ filePath: 'C:\\Music\\many.flac', title: 'Many', composer: 'A; B; C; D; E' }),
      scanned({ filePath: 'C:\\Music\\none.flac', title: 'None', composer: null }),
    ])

    const byTitle = new Map(tracks.getAll().map((track) => [track.title, track.composer]))
    expect(byTitle.get('One')).toBe('Bach')
    expect(byTitle.get('Many')).toBe('A; B; C; D; E')
    expect(byTitle.get('None')).toBeNull()
  })

  it('reads composer through library_track_display after a metadata refresh', () => {
    const { db, tracks, refresh } = setup()
    tracks.upsertMany([scanned({ composer: null })])
    const existing = tracks.getAll()[0]
    expect(existing.composer).toBeNull()
    db.prepare('UPDATE tracks SET metadata_checked_mtime_ms = NULL WHERE id = ?').run(existing.id)
    expect(refresh.getTracksWithMissingMetadata(10).map((row) => row.trackId)).toEqual([
      existing.id,
    ])

    refresh.updateTrackMetadata(
      refreshed(existing.id, 'C:\\Music\\song.flac', {
        composer: 'A; B; C',
      }),
    )

    expect(tracks.getAll()[0].composer).toBe('A; B; C')
    expect(refresh.getTracksWithMissingMetadata(10)).toEqual([])
  })
})
