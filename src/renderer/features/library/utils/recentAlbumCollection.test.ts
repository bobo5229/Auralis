import { describe, expect, it } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import {
  filterRecentAlbums,
  groupRecentAlbumMonths,
  recentAlbumCollection,
} from './recentAlbumCollection'

function track(
  id: number,
  album: string,
  createdAt: string,
  albumArtist = 'Artist',
): TrackListItem {
  return {
    id,
    album,
    createdAt,
    albumArtist,
    artist: albumArtist,
    title: `Track ${id}`,
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
  }
}
describe('recent album collection', () => {
  it('orders unique albums by newest addition and keeps older tracks in an updated album', () => {
    const tracks = [
      track(1, 'A', '2025-01-01'),
      track(2, 'B', '2026-11-01'),
      track(3, 'A', '2026-11-06'),
    ]
    const albums = recentAlbumCollection(tracks)
    expect(albums.map((a) => a.title)).toEqual(['A', 'B'])
    const recent = filterRecentAlbums(albums, 1, Date.parse('2026-11-06T12:00:00Z'))
    expect(recent.map((a) => a.title)).toEqual(['A'])
    expect(recent[0].tracks.map((t) => t.id)).toEqual([1, 3])
    expect(tracks.map((t) => t.id)).toEqual([1, 2, 3])
  })
  it('separates same-title albums by artist and sorts invalid dates last with stable ties', () => {
    const albums = recentAlbumCollection([
      track(1, 'A', 'invalid'),
      track(2, 'B', '2026-01-01'),
      track(3, 'B', '2026-01-01', 'Other'),
      track(4, 'Unknown', 'invalid'),
    ])
    expect(albums.map((a) => a.latestTrackId)).toEqual([3, 2, 4, 1])
    expect(filterRecentAlbums(albums, 'all', 0)).toHaveLength(4)
  })
  it('includes both range boundaries and excludes future and unknown dates', () => {
    const now = Date.UTC(2026, 10, 6, 12)
    const albums = recentAlbumCollection([
      track(1, 'A', new Date(now - 7 * 86400000).toISOString()),
      track(2, 'B', new Date(now).toISOString()),
      track(3, 'C', new Date(now + 1).toISOString()),
      track(4, 'D', 'invalid'),
    ])
    expect(filterRecentAlbums(albums, 7, now).map((a) => a.title)).toEqual(['B', 'A'])
  })
  it('groups by local calendar month across year boundaries and keeps undated albums', () => {
    const albums = recentAlbumCollection([
      track(1, 'A', new Date(2026, 0, 1).toISOString()),
      track(2, 'B', new Date(2025, 11, 31).toISOString()),
      track(3, 'C', 'invalid'),
    ])
    expect(groupRecentAlbumMonths(albums).map((g) => g.key)).toEqual([
      '2026-0',
      '2025-11',
      'undated',
    ])
    expect(groupRecentAlbumMonths([])).toEqual([])
  })
})
