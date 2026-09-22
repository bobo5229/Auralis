import { describe, expect, it } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import { getAlbumCatalogIndex } from './albumCatalogIndex'

const track = (id: number, album: string, trackNo: number): TrackListItem => ({
  id,
  album,
  trackNo,
  title: `Track ${id}`,
  albumArtist: 'Artist',
  artist: 'Artist',
  discNo: 1,
  durationSeconds: 180,
  releaseDate: '2020',
  copyright: null,
  genre: null,
  artworkCacheKey: null,
  availability: 'available',
  playCount: 0,
  lastPlayedAt: null,
  createdAt: '2026-01-01',
})

describe('album catalog index', () => {
  it('shares derived data across list and detail without changing source order', () => {
    const tracks = [track(1, 'A', 2), track(2, 'A', 1), track(3, 'B', 1)]
    const index = getAlbumCatalogIndex(tracks)
    expect(getAlbumCatalogIndex(tracks)).toBe(index)
    expect(index.selectTracks('Artist', 'A').map((item) => item.id)).toEqual([2, 1])
    expect(index.albums[0].tracks.map((item) => item.id)).toEqual([1, 2])
    expect(index.moreAlbums('Artist', 'A').map((item) => item.title)).toEqual(['B'])
    expect(index.moreAlbums('Unknown Artist', 'A')).toEqual([])
  })

  it('uses a fresh index when a replacement snapshot contains edited or removed tracks', () => {
    const old = [track(1, 'A', 1), track(2, 'B', 1)]
    const first = getAlbumCatalogIndex(old)
    const next = getAlbumCatalogIndex([{ ...old[0], album: 'C' }])
    expect(next).not.toBe(first)
    expect(next.selectTracks('Artist', 'A')).toEqual([])
    expect(next.moreAlbums('Artist', 'C')).toEqual([])
    expect(next.selectTracks('Artist', 'C')[0].id).toBe(1)
  })

  it('does not revisit unrelated track metadata on warm detail lookups', () => {
    let reads = 0
    const unrelated = track(2, 'Other', 1)
    Object.defineProperty(unrelated, 'albumArtist', {
      get: () => {
        reads++
        return 'Other artist'
      },
    })
    const tracks = [track(1, 'A', 1), unrelated]
    const index = getAlbumCatalogIndex(tracks)
    const baseline = reads
    expect(getAlbumCatalogIndex(tracks).selectTracks('Artist', 'A')).toHaveLength(1)
    expect(index.moreAlbums('Artist', 'A')).toEqual([])
    expect(reads).toBe(baseline)
  })
})
