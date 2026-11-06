import { describe, expect, it } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import { getAlbumCatalogIndex } from '@renderer/shared/catalog/albumCatalogIndex'

const track = (id: number, album: string, trackNo: number): TrackListItem => ({
  id,
  album,
  trackNo,
  title: `Track ${id}`,
  albumArtist: 'Artist',
  artist: 'Artist',
  discNo: 1,
  bitrateBps: null,
  durationSeconds: 180,
  releaseDate: '2020',
  copyright: null,
  composer: null,
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

it('owns deeply immutable derived caches without freezing caller-owned tracks', () => {
  const source = [track(1, 'A', 2), track(2, 'A', 1), track(3, 'B', 1)]
  const index = getAlbumCatalogIndex(source)
  const selected = index.selectTracks('Artist', 'A')
  expect(() => (selected as unknown as TrackListItem[]).pop()).toThrow(TypeError)
  expect(() => {
    ;(selected[0] as TrackListItem).title = 'changed'
  }).toThrow(TypeError)
  expect(() => (index.albums as unknown as unknown[]).splice(0, 1)).toThrow(TypeError)
  expect(() => (index.moreAlbums('Artist', 'A') as unknown as unknown[]).pop()).toThrow(TypeError)
  expect(index.selectTracks('Artist', 'A').map((item) => item.id)).toEqual([2, 1])
  expect(Object.isFrozen(source)).toBe(false)
  expect(Object.isFrozen(source[0])).toBe(false)
  source[1].title = 'caller changed'
  expect(selected[0].title).toBe('Track 2')
})

it('reuses already immutable catalog objects while protecting derived containers', () => {
  const item = Object.freeze(track(1, 'A', 1))
  const source = Object.freeze([item])
  const index = getAlbumCatalogIndex(source)
  expect(index.selectTracks('Artist', 'A')[0]).toBe(item)
  expect(index.albums[0].tracks[0]).toBe(item)
  expect(index.selectTracks('Artist', 'A')).toBe(index.selectTracks('Artist', 'A'))
})
