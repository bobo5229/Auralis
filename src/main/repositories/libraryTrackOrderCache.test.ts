import { expect, it, vi } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import { sortLibraryTracks } from './libraryTrackSort'
import { LibraryTrackOrderCache } from './libraryTrackOrderCache'

function row(id: number, patch: Partial<TrackListItem> = {}): TrackListItem {
  return {
    id,
    title: `Track ${id}`,
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    trackNo: id,
    discNo: 1,
    releaseDate: '2026',
    copyright: null,
    composer: null,
    bitrateBps: null,
    durationSeconds: 180,
    artworkCacheKey: null,
    genre: null,
    availability: 'available',
    playCount: 0,
    lastPlayedAt: null,
    createdAt: '2026-11-07',
    ...patch,
  }
}

it('reuses the full order for fresh statistics and leaves previous rows unchanged', () => {
  const sort = vi.fn(sortLibraryTracks)
  const cache = new LibraryTrackOrderCache(sort)
  const before = cache.order([row(3), row(1), row(2)])
  const after = cache.order([row(2, { playCount: 7, lastPlayedAt: '2026-11-07' }), row(3), row(1)])
  expect(after.map((track) => track.id)).toEqual([1, 2, 3])
  expect(after[1].playCount).toBe(7)
  expect(before[1].playCount).toBe(0)
  expect(sort).toHaveBeenCalledOnce()
})

it.each(['albumArtist', 'artist', 'releaseDate', 'discNo', 'trackNo'] as const)(
  'resorts when %s changes and matches the complete established comparator',
  (field) => {
    const sort = vi.fn(sortLibraryTracks)
    const cache = new LibraryTrackOrderCache(sort)
    cache.order([row(1), row(2), row(3)])
    const patch = { [field]: typeof row(1)[field] === 'number' ? 8 : '周杰伦' }
    const changed = [row(1, patch), row(2), row(3)]
    const expected = sortLibraryTracks(changed.map((track) => ({ ...track })))
    expect(cache.order(changed)).toEqual(expected)
    expect(sort).toHaveBeenCalledTimes(2)
  },
)

it('resorts on additions or removals even when every retained key is unchanged', () => {
  const sort = vi.fn(sortLibraryTracks)
  const cache = new LibraryTrackOrderCache(sort)
  cache.order([row(1), row(2)])
  expect(cache.order([row(3), row(1), row(2)]).map((track) => track.id)).toEqual([1, 2, 3])
  expect(cache.order([row(3), row(1)]).map((track) => track.id)).toEqual([1, 3])
  expect(sort).toHaveBeenCalledTimes(3)
})
