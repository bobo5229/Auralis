import { describe, expect, it } from 'vitest'
import {
  createLibrarySearchIndex,
  createLibrarySearchIndexIncrementally,
  LibrarySearchIndexBuildStaleError,
} from './librarySearchIndex'
import { scanLibrarySearchIndex, type LibrarySearchRecord } from './librarySearchScan'
import type { TrackListItem } from '@shared/types/libraryScan'

function createTrack(id: number, patch: Partial<TrackListItem> = {}): TrackListItem {
  return {
    id,
    title: null,
    artist: null,
    album: null,
    albumArtist: null,
    trackNo: null,
    discNo: null,
    releaseDate: null,
    copyright: null,
    durationSeconds: null,
    artworkCacheKey: null,
    genre: null,
    availability: 'available',
    playCount: 0,
    lastPlayedAt: null,
    createdAt: '2026-08-12T00:00:00.000Z',
    ...patch,
  }
}

const records: readonly LibrarySearchRecord[] = [
  { title: 'alpha', artist: 'alpha artist', albumArtist: 'alpha artist', album: 'record a' },
  { title: 'beta', artist: 'alpha ensemble', albumArtist: '', album: 'record b' },
  { title: 'gamma', artist: 'artist three', albumArtist: '', album: 'record c' },
]

describe('scanLibrarySearchIndex', () => {
  it('returns an empty outcome when the query has no match', () => {
    expect(scanLibrarySearchIndex(records, 'missing', 0)).toEqual({
      totalMatches: 0,
      targetIndex: null,
      matchPosition: null,
      wrapped: false,
    })
  })

  it('counts a track matching multiple fields only once', () => {
    expect(scanLibrarySearchIndex(records, 'alpha', 0)).toEqual({
      totalMatches: 2,
      targetIndex: 0,
      matchPosition: 1,
      wrapped: false,
    })
  })

  it('continues from the requested index and reports the ordered match position', () => {
    expect(scanLibrarySearchIndex(records, 'alp', 1)).toEqual({
      totalMatches: 2,
      targetIndex: 1,
      matchPosition: 2,
      wrapped: false,
    })
  })

  it('wraps to the first match after reaching the end', () => {
    expect(scanLibrarySearchIndex(records, 'alp', records.length)).toEqual({
      totalMatches: 2,
      targetIndex: 0,
      matchPosition: 1,
      wrapped: true,
    })
  })
})

describe('createLibrarySearchIndex', () => {
  it('normalizes nullable metadata once into immutable search records', () => {
    const index = createLibrarySearchIndex([
      createTrack(1, {
        title: '  ＡLPHA 與夢  ',
        artist: null,
        albumArtist: 'Artist',
        album: 'Album',
      }),
    ])

    expect(index).toEqual([
      {
        title: 'alpha 与梦',
        artist: '',
        albumArtist: 'artist',
        album: 'album',
      },
    ])
    expect(Object.isFrozen(index)).toBe(true)
    expect(Object.isFrozen(index[0])).toBe(true)
  })

  it('publishes one complete incremental index after yielding between bounded slices', async () => {
    const tracks = Array.from({ length: 300 }, (_, index) =>
      createTrack(index + 1, { title: `  Ｔrack ${index + 1}  `, artist: 'Artist' }),
    )
    const yields: number[] = []
    let clock = 0
    const index = await createLibrarySearchIndexIncrementally(tracks, {
      isCurrent: () => true,
      chunkBudgetMs: 1,
      now: () => ++clock,
      yieldToMain: async () => {
        yields.push(clock)
      },
    })

    expect(yields.length).toBeGreaterThan(1)
    expect(index).toHaveLength(tracks.length)
    expect(index[0].title).toBe('track 1')
    expect(index.at(-1)?.title).toBe('track 300')
    expect(Object.isFrozen(index)).toBe(true)
  })

  it('discards an incremental index when its generation becomes stale', async () => {
    const tracks = Array.from({ length: 300 }, (_, index) => createTrack(index + 1))
    let isCurrent = true
    let yieldCount = 0
    let clock = 0

    await expect(
      createLibrarySearchIndexIncrementally(tracks, {
        isCurrent: () => isCurrent,
        chunkBudgetMs: 1,
        now: () => ++clock,
        yieldToMain: async () => {
          yieldCount += 1
          if (yieldCount === 2) isCurrent = false
        },
      }),
    ).rejects.toBeInstanceOf(LibrarySearchIndexBuildStaleError)
  })
})
