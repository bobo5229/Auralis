import { describe, expect, it } from 'vitest'
import { currentArtistLetter, visibleIndex } from './artistIndexPosition'

describe('artist index position', () => {
  it('ignores overscanned rows above the visible edge', () => {
    const rows = [
      { index: 0, start: 0, size: 40 },
      { index: 1, start: 40, size: 40 },
      { index: 2, start: 80, size: 40 },
    ]
    expect(visibleIndex(rows, 0)).toBe(0)
    expect(visibleIndex(rows, 40)).toBe(1)
    expect(visibleIndex(rows, 99)).toBe(2)
    expect(visibleIndex([], 10)).toBeNull()
  })
  it('selects the closest available preceding anchor and the first letter on a shared row', () => {
    const anchors = [
      { letter: 'A', rowIndex: 0 },
      { letter: 'B', rowIndex: 2 },
      { letter: 'C', rowIndex: 2 },
      { letter: 'Z', rowIndex: null },
    ] as const
    expect(currentArtistLetter(anchors, 1)).toBe('A')
    expect(currentArtistLetter(anchors, 2)).toBe('B')
    expect(currentArtistLetter(anchors, 7)).toBe('B')
    expect(currentArtistLetter(anchors, null)).toBeNull()
  })
})
