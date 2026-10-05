import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import type { ScannedTrack } from '@shared/types/libraryScan'
import { migrateDatabase } from '../database/schema'
import { LibraryService } from '../services/libraryService'
import { LibraryRepository } from './libraryRepository'
import { PlayStatsRepository } from './playStatsRepository'
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
  return {
    db,
    tracks,
    playStats: new PlayStatsRepository(db),
    library: new LibraryService(new LibraryRepository(db), tracks),
  }
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
    genre: 'Jazz',
    artworkCacheKey: null,
    lyricsText: null,
    lyricsFormat: null,
    isrc: null,
    metadataSignature: `sig-${id}`,
    ...patch,
  }
}

function trackId(db: Database.Database, id: number): number {
  const row = db
    .prepare('SELECT id FROM tracks WHERE file_path = ?')
    .get(`C:\\Music\\${id}.flac`) as { id: number } | undefined
  if (!row) throw new Error(`Missing isolated test track ${id}`)
  return row.id
}

function addDailyStats(
  db: Database.Database,
  date: string,
  id: number,
  playCount = 1,
  durationSeconds = 180,
  lastPlayedAt = `${date}T12:00:00.000Z`,
): void {
  db.prepare(
    `INSERT INTO daily_track_play_stats (
       play_date, track_id, play_count, duration_seconds, last_played_at
     ) VALUES (?, ?, ?, ?, ?)`,
  ).run(date, trackId(db, id), playCount, durationSeconds, lastPlayedAt)
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})

describe('PlayStatsRepository.getDailyAlbumStats', () => {
  it('aggregates tracks for one date and returns an empty list for a date without plays', () => {
    const { db, tracks, playStats } = setup()
    tracks.upsertMany([
      scanned(1, { album: 'Shared', albumArtist: 'Band', durationSeconds: 100 }),
      scanned(2, { album: 'Shared', albumArtist: 'Band', artist: 'Singer', durationSeconds: 180 }),
      scanned(3, { album: 'Other day', albumArtist: 'Band' }),
    ])
    addDailyStats(db, '2026-06-15', 1, 2, 200, '2026-06-15T10:00:00.000Z')
    addDailyStats(db, '2026-06-15', 2, 3, 540, '2026-06-15T11:00:00.000Z')
    addDailyStats(db, '2026-06-14', 3, 7, 1260)

    expect(playStats.getDailyAlbumStats('2026-06-15')).toEqual([
      {
        key: JSON.stringify(['Shared', 'Band']),
        albumKey: { album: 'Shared', albumArtist: 'Band' },
        title: 'Shared',
        artist: 'Band',
        artworkCacheKey: null,
        playCount: 5,
        durationSeconds: 740,
      },
    ])
    expect(playStats.getDailyAlbumStats('2026-06-16')).toEqual([])
  })

  it('limits results to five with play count, recency, and binary identity ordering', () => {
    const { db, tracks, playStats } = setup()
    tracks.upsertMany([
      scanned(1, { album: 'A', albumArtist: 'Z' }),
      scanned(2, { album: 'A', albumArtist: 'A' }),
      scanned(3, { album: 'Z', albumArtist: 'A' }),
      scanned(4, { album: 'B', albumArtist: 'A' }),
      scanned(5, { album: 'C', albumArtist: 'A' }),
      scanned(6, { album: 'D', albumArtist: 'A' }),
      scanned(7, { album: 'E', albumArtist: 'A' }),
    ])
    const date = '2026-06-15'
    addDailyStats(db, date, 1, 10, 100, `${date}T10:00:00.000Z`)
    addDailyStats(db, date, 2, 10, 100, `${date}T10:00:00.000Z`)
    addDailyStats(db, date, 3, 10, 100, `${date}T11:00:00.000Z`)
    addDailyStats(db, date, 4, 10, 100, `${date}T10:00:00.000Z`)
    addDailyStats(db, date, 5, 9, 90, `${date}T12:00:00.000Z`)
    addDailyStats(db, date, 6, 8, 80, `${date}T13:00:00.000Z`)
    addDailyStats(db, date, 7, 7, 70, `${date}T14:00:00.000Z`)

    expect(playStats.getDailyAlbumStats(date).map(({ title, artist }) => [title, artist])).toEqual([
      ['Z', 'A'],
      ['A', 'A'],
      ['A', 'Z'],
      ['B', 'A'],
      ['C', 'A'],
    ])
  })

  it('keeps delimiter-collision identities separate and passes each key to album playback', () => {
    const { db, tracks, playStats, library } = setup()
    tracks.upsertMany([
      scanned(1, {
        title: 'Twin',
        album: 'A::B',
        artist: 'C',
        albumArtist: '',
        trackNo: 2,
        discNo: 1,
      }),
      scanned(2, {
        title: 'Twin',
        album: 'A::B',
        artist: 'C',
        albumArtist: '',
        trackNo: 2,
        discNo: 1,
      }),
      scanned(3, {
        title: 'Disc Two',
        album: 'A::B',
        artist: 'C',
        albumArtist: '',
        trackNo: 1,
        discNo: 2,
      }),
      scanned(4, {
        title: 'Unnumbered',
        album: 'A::B',
        artist: 'C',
        albumArtist: '',
        trackNo: null,
        discNo: null,
      }),
      scanned(5, {
        title: 'Missing',
        album: 'A::B',
        artist: 'C',
        albumArtist: '',
        trackNo: 1,
        discNo: 1,
      }),
      scanned(6, { album: 'A', artist: 'Track artist', albumArtist: 'B::C' }),
      scanned(7, { album: 'A::B', artist: 'Other artist', albumArtist: '' }),
    ])
    db.prepare("UPDATE tracks SET availability = 'missing' WHERE id = ?").run(trackId(db, 5))
    const date = '2026-06-15'
    for (let id = 1; id <= 7; id++) addDailyStats(db, date, id)

    const items = playStats.getDailyAlbumStats(date)
    const first = items.find((item) => item.title === 'A::B' && item.artist === 'C')
    const collided = items.find((item) => item.title === 'A' && item.artist === 'B::C')
    const sameTitleOtherArtist = items.find(
      (item) => item.title === 'A::B' && item.artist === 'Other artist',
    )
    expect(first?.key).toBe(JSON.stringify(['A::B', 'C']))
    expect(collided?.key).toBe(JSON.stringify(['A', 'B::C']))
    expect(first?.key).not.toBe(collided?.key)
    expect(sameTitleOtherArtist?.key).toBe(JSON.stringify(['A::B', 'Other artist']))
    expect(first?.albumKey).toEqual({ album: 'A::B', albumArtist: 'C' })
    expect(collided?.albumKey).toEqual({ album: 'A', albumArtist: 'B::C' })

    const playable = library.getAlbumTracks(first!.albumKey!)
    expect(playable?.tracks.map((track) => track.id)).toEqual([
      trackId(db, 1),
      trackId(db, 2),
      trackId(db, 3),
      trackId(db, 4),
    ])
    expect(playable?.tracks[0]?.id).toBe(trackId(db, 1))
  })

  it('separates missing metadata from literal fallback labels and uses artist fallback', () => {
    const { db, tracks, playStats } = setup()
    tracks.upsertMany([
      scanned(1, { album: '', artist: '', albumArtist: '' }),
      scanned(2, { album: '', artist: '', albumArtist: '' }),
      scanned(3, { album: '未知专辑', artist: '未知艺术家', albumArtist: '' }),
      scanned(4, { album: 'Fallback', artist: 'Fallback artist', albumArtist: '' }),
    ])
    const date = '2026-06-15'
    addDailyStats(db, date, 1, 2, 180)
    addDailyStats(db, date, 2, 3, 240)
    addDailyStats(db, date, 3)
    addDailyStats(db, date, 4)

    const items = playStats.getDailyAlbumStats(date)
    const unknown = items.find((item) => item.title === null && item.artist === null)
    expect(unknown).toMatchObject({
      key: JSON.stringify([null, null]),
      albumKey: null,
      playCount: 5,
      durationSeconds: 420,
    })
    expect(items).toHaveLength(3)
    expect(items.find((item) => item.title === '未知专辑')).toMatchObject({
      artist: '未知艺术家',
      albumKey: { album: '未知专辑', albumArtist: '未知艺术家' },
    })
    expect(items.find((item) => item.title === 'Fallback')).toMatchObject({
      artist: 'Fallback artist',
      albumKey: { album: 'Fallback', albumArtist: 'Fallback artist' },
    })
  })

  it('retains missing-file history and leaves availability checks to album playback', () => {
    const { db, tracks, playStats, library } = setup()
    tracks.upsertMany([
      scanned(1, { album: 'Unavailable', albumArtist: 'Band' }),
      scanned(2, { album: 'Partial', albumArtist: 'Band' }),
      scanned(3, { album: 'Partial', albumArtist: 'Band' }),
    ])
    db.prepare("UPDATE tracks SET availability = 'missing' WHERE id IN (?, ?)").run(
      trackId(db, 1),
      trackId(db, 2),
    )
    const date = '2026-06-15'
    addDailyStats(db, date, 1, 4, 720)
    addDailyStats(db, date, 2, 2, 360)

    const items = playStats.getDailyAlbumStats(date)
    expect(items.find((item) => item.title === 'Unavailable')).toMatchObject({
      playCount: 4,
    })
    expect(items.find((item) => item.title === 'Partial')).toMatchObject({
      playCount: 2,
    })
    const unavailable = items.find((item) => item.title === 'Unavailable')!
    const partial = items.find((item) => item.title === 'Partial')!
    expect(library.getAlbumTracks(unavailable.albumKey!)).toBeNull()
    expect(library.getAlbumTracks(partial.albumKey!)?.tracks.map((track) => track.id)).toEqual([
      trackId(db, 3),
    ])
    expect(partial).not.toHaveProperty('canPlay')
  })

  it('uses display metadata and aggregates artwork keys from current track metadata', () => {
    const { db, tracks, playStats, library } = setup()
    tracks.upsertMany([
      scanned(1, { album: 'File album', albumArtist: 'File album artist' }),
      scanned(2, { album: 'File album', albumArtist: 'File album artist' }),
    ])
    const addMetadata = db.prepare(
      `INSERT INTO track_metadata (
         track_id, album_title, album_artist_display, artwork_cache_key, source
       ) VALUES (?, 'Displayed album', 'Displayed artist', ?, 'user_edit')`,
    )
    addMetadata.run(trackId(db, 1), 'cover-a')
    addMetadata.run(trackId(db, 2), 'cover-z')
    const date = '2026-06-15'
    addDailyStats(db, date, 1, 2, 300)
    addDailyStats(db, date, 2, 3, 450)

    const [item] = playStats.getDailyAlbumStats(date)
    expect(item).toMatchObject({
      key: JSON.stringify(['Displayed album', 'Displayed artist']),
      albumKey: { album: 'Displayed album', albumArtist: 'Displayed artist' },
      title: 'Displayed album',
      artist: 'Displayed artist',
      artworkCacheKey: 'cover-z',
      playCount: 5,
      durationSeconds: 750,
    })
    expect(library.getAlbumTracks(item!.albumKey!)?.tracks.map((track) => track.id)).toEqual([
      trackId(db, 1),
      trackId(db, 2),
    ])
  })

  it('merges current display metadata and removed history for the same day and album', () => {
    const { db, tracks, playStats } = setup()
    tracks.upsertMany([
      scanned(1, { album: 'Shared', albumArtist: 'Band' }),
      scanned(2, { album: 'Other day', albumArtist: 'Band' }),
      scanned(3, { album: 'File album', albumArtist: 'File artist' }),
    ])
    db.prepare(
      `INSERT INTO track_metadata (
         track_id, album_title, album_artist_display, artwork_cache_key, source
       ) VALUES (?, 'Displayed album', 'Band', 'cover-m', 'user_edit')`,
    ).run(trackId(db, 3))
    const date = '2026-06-15'
    addDailyStats(db, date, 1, 2, 200, `${date}T10:00:00.000Z`)
    addDailyStats(db, '2026-06-14', 2, 99, 9900)
    addDailyStats(db, date, 3, 3, 300, `${date}T12:00:00.000Z`)
    const addRemoved = db.prepare(
      `INSERT INTO removed_track_history (
         id, album, album_artist, artist, artwork_cache_key, source_file_path, recovery_json
       ) VALUES (?, ?, ?, ?, ?, ?, '{}')`,
    )
    addRemoved.run(1001, 'Shared', 'Band', 'Singer', 'cover-z', 'C:\\Removed\\1.flac')
    addRemoved.run(1002, 'Displayed album', 'Band', 'Singer', 'cover-a', 'C:\\Removed\\2.flac')
    addRemoved.run(1003, 'History only', '', 'Fallback artist', 'cover-x', 'C:\\Removed\\3.flac')
    const addRemovedStats = db.prepare(
      `INSERT INTO removed_daily_track_play_stats (
         play_date, track_id, play_count, duration_seconds, last_played_at
       ) VALUES (?, ?, ?, ?, ?)`,
    )
    addRemovedStats.run(date, 1001, 4, 400, `${date}T11:00:00.000Z`)
    addRemovedStats.run(date, 1002, 5, 500, `${date}T13:00:00.000Z`)
    addRemovedStats.run(date, 1003, 1, 180, `${date}T09:00:00.000Z`)
    addRemovedStats.run('2026-06-14', 1001, 99, 9900, '2026-06-14T12:00:00.000Z')

    expect(playStats.getDailyAlbumStats(date)).toEqual([
      {
        key: JSON.stringify(['Displayed album', 'Band']),
        albumKey: { album: 'Displayed album', albumArtist: 'Band' },
        title: 'Displayed album',
        artist: 'Band',
        artworkCacheKey: 'cover-m',
        playCount: 8,
        durationSeconds: 800,
      },
      {
        key: JSON.stringify(['Shared', 'Band']),
        albumKey: { album: 'Shared', albumArtist: 'Band' },
        title: 'Shared',
        artist: 'Band',
        artworkCacheKey: 'cover-z',
        playCount: 6,
        durationSeconds: 600,
      },
      {
        key: JSON.stringify(['History only', 'Fallback artist']),
        albumKey: { album: 'History only', albumArtist: 'Fallback artist' },
        title: 'History only',
        artist: 'Fallback artist',
        artworkCacheKey: 'cover-x',
        playCount: 1,
        durationSeconds: 180,
      },
    ])
    expect(playStats.getDailyAlbumStats('2026-06-16')).toEqual([])
  })
})
