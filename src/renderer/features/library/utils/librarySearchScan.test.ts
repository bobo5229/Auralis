import { describe, expect, it } from 'vitest'
import {
  createLibrarySearchIndex,
  createLibrarySearchIndexIncrementally,
  LibrarySearchIndexBuildStaleError,
} from './librarySearchIndex'
import { scanLibrarySearchIndex, type LibrarySearchRecord } from './librarySearchScan'
import type { TrackListItem } from '@shared/types/libraryScan'
import { normalizeSearchText } from './normalizeSearchText'

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
    composer: null,
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
  {
    title: 'alpha',
    artist: 'alpha artist',
    artistParts: ['alpha artist'],
    albumArtist: 'alpha artist',
    albumArtistParts: ['alpha artist'],
    album: 'record a',
  },
  {
    title: 'beta',
    artist: 'alpha ensemble',
    artistParts: ['alpha ensemble'],
    albumArtist: '',
    albumArtistParts: [],
    album: 'record b',
  },
  {
    title: 'gamma',
    artist: 'artist three',
    artistParts: ['artist three'],
    albumArtist: '',
    albumArtistParts: [],
    album: 'record c',
  },
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
  it('matches later artists once per track, cycles in source order, and preserves combined prefixes', () => {
    const tracks = [
      createTrack(1, { artist: 'Ariana Grande; Nicki Minaj', albumArtist: 'Guest; Nicki Minaj' }),
      createTrack(2, { artist: 'Nicki Minaj; Nicki Chorus', albumArtist: 'Lead; 蕭敬騰' }),
    ]
    const originals = structuredClone(tracks)
    const index = createLibrarySearchIndex(tracks)
    for (const [fromIndex, targetIndex, matchPosition, wrapped] of [
      [0, 0, 1, false],
      [1, 1, 2, false],
      [2, 0, 1, true],
    ] as const) {
      expect(scanLibrarySearchIndex(index, 'nicki', fromIndex)).toEqual({
        totalMatches: 2,
        targetIndex,
        matchPosition,
        wrapped,
      })
    }
    expect(scanLibrarySearchIndex(index, normalizeSearchText('萧敬腾'), 0)).toMatchObject({
      totalMatches: 1,
      targetIndex: 1,
    })
    expect(scanLibrarySearchIndex(index, 'ariana grande; n', 0)).toMatchObject({
      totalMatches: 1,
      targetIndex: 0,
    })
    expect(tracks).toEqual(originals)
    expect(Object.isFrozen(index[0].artistParts)).toBe(true)
    expect(Object.isFrozen(index[0].albumArtistParts)).toBe(true)
  })

  it.each([
    ['AC/DC', 'dc'],
    ['Ariana/Nicki', 'nicki'],
    ['Ariana & Nicki', 'nicki'],
    ['Ariana, Nicki', 'nicki'],
    ['Ariana;Nicki', 'nicki'],
    ['Ariana； Nicki', 'nicki'],
  ])('keeps %s atomic rather than matching %s as a later artist', (artist, query) => {
    const index = createLibrarySearchIndex([createTrack(1, { artist, albumArtist: artist })])
    expect(scanLibrarySearchIndex(index, query, 0).totalMatches).toBe(0)
    expect(scanLibrarySearchIndex(index, normalizeSearchText(artist), 0).totalMatches).toBe(1)
  })

  it('matches expanded character coverage across all searchable fields in source order', () => {
    const tracks = [
      createTrack(1, { title: '鬱可唯 現場' }),
      createTrack(2, { artist: '郁可唯' }),
      createTrack(3, { albumArtist: '鬱可唯' }),
      createTrack(4, { album: '郁可唯 精選' }),
    ]
    const originals = structuredClone(tracks)
    const index = createLibrarySearchIndex(tracks)
    const query = normalizeSearchText('郁可唯')

    expect(scanLibrarySearchIndex(index, query, 2)).toEqual({
      totalMatches: 4,
      targetIndex: 2,
      matchPosition: 3,
      wrapped: false,
    })
    expect(scanLibrarySearchIndex(index, query, tracks.length)).toEqual({
      totalMatches: 4,
      targetIndex: 0,
      matchPosition: 1,
      wrapped: true,
    })
    expect(tracks).toEqual(originals)
  })

  it('retains context-sensitive prefixes in the complete incremental index', async () => {
    const tracks = ['乾坤', '沈默是金', '藉口', '瞭解', '著名'].map((title, i) =>
      createTrack(i + 1, { title }),
    )
    const index = await createLibrarySearchIndexIncrementally(tracks, {
      isCurrent: () => true,
      yieldToMain: async () => {},
    })

    for (let i = 0; i < tracks.length; i += 1) {
      const query = normalizeSearchText(tracks[i].title?.slice(0, 1))
      expect(scanLibrarySearchIndex(index, query, 0)).toMatchObject({
        totalMatches: 1,
        targetIndex: i,
      })
    }
  })

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
        artistParts: [],
        albumArtist: 'artist',
        albumArtistParts: ['artist'],
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
