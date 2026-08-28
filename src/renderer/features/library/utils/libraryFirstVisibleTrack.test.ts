import { describe, expect, it } from 'vitest'
import { LIBRARY_LAYOUT_METRICS } from '../constants/libraryLayoutMetrics'
import { resolveFirstVisibleTrackIndex } from './libraryFirstVisibleTrack'

const TOP_INSET = 16
const FLAT_ROW_HEIGHT = LIBRARY_LAYOUT_METRICS.flatRowHeight

function resolve(overrides: Partial<Parameters<typeof resolveFirstVisibleTrackIndex>[0]> = {}) {
  return resolveFirstVisibleTrackIndex({
    scrollTop: 0,
    topInset: TOP_INSET,
    isCoverView: false,
    flatRowHeight: FLAT_ROW_HEIGHT,
    trackCount: 10,
    virtualAlbumGroups: [],
    albumGroups: [],
    ...overrides,
  })
}

describe('resolveFirstVisibleTrackIndex', () => {
  it('returns 0 for an empty list', () => {
    expect(resolve({ trackCount: 0, scrollTop: 400 })).toBe(0)
  })

  it('uses flat-row floor division after subtracting the top inset', () => {
    expect(resolve({ scrollTop: TOP_INSET })).toBe(0)
    expect(resolve({ scrollTop: TOP_INSET + FLAT_ROW_HEIGHT - 1 })).toBe(0)
    expect(resolve({ scrollTop: TOP_INSET + FLAT_ROW_HEIGHT })).toBe(1)
    expect(resolve({ scrollTop: 0 })).toBe(0)
  })

  it('clamps the flat index to the last track', () => {
    expect(
      resolve({
        trackCount: 3,
        scrollTop: TOP_INSET + FLAT_ROW_HEIGHT * 10,
      }),
    ).toBe(2)
  })

  it('uses the first cover group whose end is past the offset', () => {
    const virtualAlbumGroups = [
      { index: 0, end: 300 },
      { index: 1, end: 600 },
    ]
    const albumGroups = [{ firstTrackIndex: 0 }, { firstTrackIndex: 8 }]

    expect(
      resolve({
        isCoverView: true,
        trackCount: 12,
        virtualAlbumGroups,
        albumGroups,
        scrollTop: TOP_INSET + 299,
      }),
    ).toBe(0)
    expect(
      resolve({
        isCoverView: true,
        trackCount: 12,
        virtualAlbumGroups,
        albumGroups,
        scrollTop: TOP_INSET + 300,
      }),
    ).toBe(8)
  })

  it('falls back to the first virtual group when none end past the offset', () => {
    expect(
      resolve({
        isCoverView: true,
        trackCount: 12,
        virtualAlbumGroups: [
          { index: 0, end: 300 },
          { index: 1, end: 600 },
        ],
        albumGroups: [{ firstTrackIndex: 0 }, { firstTrackIndex: 8 }],
        scrollTop: TOP_INSET + 600,
      }),
    ).toBe(0)
  })

  it('returns 0 when the cover group lookup misses', () => {
    expect(
      resolve({
        isCoverView: true,
        trackCount: 4,
        virtualAlbumGroups: [{ index: 9, end: 100 }],
        albumGroups: [{ firstTrackIndex: 2 }],
        scrollTop: TOP_INSET,
      }),
    ).toBe(0)
  })
})
