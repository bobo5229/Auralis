import { describe, expect, it } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'

import {
  groupAlbums,
  moreAlbumsByArtist,
  moreAlbumsByGenre,
  selectAlbumTracks,
  sortAlbumsByYearThenTitle,
} from './albumGrouping'

function createTrack(id: number, patch: Partial<TrackListItem> = {}): TrackListItem {
  return {
    id,
    title: `Track ${id}`,
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    trackNo: id,
    discNo: 1,
    releaseDate: null,
    copyright: null,
    composer: null,
    bitrateBps: null,
    durationSeconds: 180,
    artworkCacheKey: null,
    genre: null,
    availability: 'available',
    playCount: 0,
    lastPlayedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  }
}

describe('selectAlbumTracks', () => {
  it('filters by effective album identity and sorts by disc, track number, then title', () => {
    const tracks = [
      createTrack(1, { discNo: 2, trackNo: 1 }),
      createTrack(2, { discNo: 1, trackNo: null, title: 'Bravo' }),
      createTrack(3, { discNo: 1, trackNo: null, title: 'Alpha' }),
      createTrack(4, { discNo: 1, trackNo: 2 }),
      createTrack(5, { album: 'Other Album' }),
      createTrack(6, {
        artist: 'Unknown Artist',
        albumArtist: null,
        album: null,
        discNo: null,
        trackNo: null,
      }),
    ]

    expect(selectAlbumTracks(tracks, 'Artist', 'Album').map((track) => track.id)).toEqual([
      4, 3, 2, 1,
    ])
    expect(
      selectAlbumTracks(tracks, 'Unknown Artist', 'Unknown Album').map((track) => track.id),
    ).toEqual([6])
  })
})

describe('groupAlbums', () => {
  it('groups tracks by effective album artist and title', () => {
    const albums = groupAlbums([
      createTrack(1, { artworkCacheKey: 'cover-a', releaseDate: '2020-01-01' }),
      createTrack(2, { album: 'Other', releaseDate: '2021-05-01' }),
      createTrack(3, { albumArtist: null, artist: 'Artist', album: 'Album' }),
    ])

    expect(albums.map((album) => album.key)).toEqual(['Artist\u0000Album', 'Artist\u0000Other'])
    expect(albums[0]?.tracks.map((track) => track.id)).toEqual([1, 3])
    expect(albums[0]?.artworkCacheKey).toBe('cover-a')
    expect(albums[0]?.releaseDate).toBe('2020-01-01')
  })
})

describe('moreAlbumsByArtist', () => {
  it.each([null, 'invalid-date'])(
    'orders equally unknown years by title after dated albums (%s)',
    (releaseDate) => {
      const albums = groupAlbums([
        createTrack(1, { album: 'Current', releaseDate }),
        createTrack(2, { album: 'Zulu', releaseDate }),
        createTrack(3, { album: 'Alpha', releaseDate }),
        createTrack(4, { album: 'Dated Z', releaseDate: '2020-01-01' }),
        createTrack(5, { album: 'Dated A', releaseDate: '2020-06-01' }),
      ])
      expect(moreAlbumsByArtist(albums, 'Artist', 'Current').map((album) => album.title)).toEqual([
        'Dated A',
        'Dated Z',
        'Alpha',
        'Zulu',
      ])
      expect(albums.map((album) => album.title)).toEqual([
        'Current',
        'Zulu',
        'Alpha',
        'Dated Z',
        'Dated A',
      ])
    },
  )

  it('excludes the current album and unknown artists, then sorts by year', () => {
    const albums = groupAlbums([
      createTrack(1, { album: 'B', releaseDate: '2022-01-01' }),
      createTrack(2, { album: 'A', releaseDate: '2020-01-01' }),
      createTrack(3, { album: 'Current', releaseDate: '2021-01-01' }),
      createTrack(4, { albumArtist: null, artist: null, album: 'Orphan' }),
    ])

    expect(moreAlbumsByArtist(albums, 'Artist', 'Current').map((album) => album.title)).toEqual([
      'A',
      'B',
    ])
    expect(moreAlbumsByArtist(albums, 'Unknown Artist', 'Orphan')).toEqual([])
    expect(sortAlbumsByYearThenTitle(albums).map((album) => album.title)).toEqual([
      'A',
      'Current',
      'B',
      'Orphan',
    ])
  })
})

describe('moreAlbumsByGenre', () => {
  it('uses the first ranked genre on ties, deduplicates albums and excludes the current album', () => {
    const current = createTrack(1, { genre: 'Jazz; R&B/SOUL' })
    const albums = groupAlbums([
      current,
      createTrack(2, { album: 'Other', genre: 'jazz' }),
      createTrack(3, { album: 'Other', genre: 'R&B/SOUL' }),
      createTrack(4, { album: 'Slash', genre: 'SOUL' }),
      createTrack(5, { album: 'Compound', genre: 'R&B/SOUL' }),
      createTrack(6, { album: 'Missing', genre: null }),
      createTrack(7, { albumArtist: 'Another Artist', genre: 'Jazz' }),
    ])
    expect(
      moreAlbumsByGenre(albums, [current], 'Artist', 'Album').map((album) => album.title),
    ).toEqual(['Other', 'Album'])
    expect(moreAlbumsByGenre(albums, [createTrack(1)], 'Artist', 'Album')).toEqual([])
  })

  it('matches only the most frequent genre and counts duplicate labels once per track', () => {
    const currentTracks = [
      createTrack(1, { genre: 'Jazz; Jazz; Jazz; R&B/SOUL' }),
      createTrack(2, { genre: 'r&b/soul' }),
    ]
    const albums = groupAlbums([
      ...currentTracks,
      createTrack(3, { album: 'Primary match', genre: 'R&B/SOUL' }),
      createTrack(4, { album: 'Secondary only', genre: 'Jazz' }),
      createTrack(5, { album: 'Partial only', genre: 'SOUL' }),
    ])
    expect(
      moreAlbumsByGenre(albums, currentTracks, 'Artist', 'Album').map((album) => album.title),
    ).toEqual(['Primary match'])
  })
})
