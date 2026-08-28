import { describe, expect, it } from 'vitest'
import { resolveKeyboardFocusTrackId, resolveKeyboardMoveIndex } from './libraryKeyboardFocus'

function hasTrackIn(ids: readonly number[]) {
  const set = new Set(ids)
  return (id: number) => set.has(id)
}

describe('resolveKeyboardFocusTrackId', () => {
  it('keeps a current focus id that is still in the index', () => {
    expect(
      resolveKeyboardFocusTrackId({
        trackCount: 3,
        currentFocusId: 2,
        selectedTrackId: 1,
        currentTrackId: 3,
        hasTrack: hasTrackIn([1, 2, 3]),
        firstTrackId: 1,
      }),
    ).toBe(2)
  })

  it('falls back from a stale focus to selected, then current, then first', () => {
    const missingCurrent = {
      trackCount: 3,
      currentFocusId: 99,
      selectedTrackId: 2,
      currentTrackId: 3,
      hasTrack: hasTrackIn([1, 2, 3]),
      firstTrackId: 1,
    }

    expect(resolveKeyboardFocusTrackId(missingCurrent)).toBe(2)
    expect(
      resolveKeyboardFocusTrackId({
        ...missingCurrent,
        selectedTrackId: 88,
      }),
    ).toBe(3)
    expect(
      resolveKeyboardFocusTrackId({
        ...missingCurrent,
        selectedTrackId: 88,
        currentTrackId: 77,
      }),
    ).toBe(1)
  })

  it('treats a null current focus as stale and uses the same fallback chain', () => {
    expect(
      resolveKeyboardFocusTrackId({
        trackCount: 2,
        currentFocusId: null,
        selectedTrackId: 5,
        currentTrackId: 6,
        hasTrack: hasTrackIn([5, 6]),
        firstTrackId: 5,
      }),
    ).toBe(5)
  })

  it('returns null for an empty list', () => {
    expect(
      resolveKeyboardFocusTrackId({
        trackCount: 0,
        currentFocusId: 1,
        selectedTrackId: 1,
        currentTrackId: 1,
        hasTrack: () => true,
        firstTrackId: 1,
      }),
    ).toBeNull()
  })

  it('returns firstTrackId when selected and current are missing from the index', () => {
    expect(
      resolveKeyboardFocusTrackId({
        trackCount: 1,
        currentFocusId: null,
        selectedTrackId: null,
        currentTrackId: null,
        hasTrack: hasTrackIn([10]),
        firstTrackId: 10,
      }),
    ).toBe(10)
  })
})

describe('resolveKeyboardMoveIndex', () => {
  it('moves next and prev with clamping', () => {
    expect(resolveKeyboardMoveIndex({ direction: 'next', currentIndex: 0, lastIndex: 4 })).toBe(1)
    expect(resolveKeyboardMoveIndex({ direction: 'next', currentIndex: 4, lastIndex: 4 })).toBe(4)
    expect(resolveKeyboardMoveIndex({ direction: 'prev', currentIndex: 3, lastIndex: 4 })).toBe(2)
    expect(resolveKeyboardMoveIndex({ direction: 'prev', currentIndex: 0, lastIndex: 4 })).toBe(0)
  })

  it('lands on 0 for both next and prev when currentIndex is -1', () => {
    expect(resolveKeyboardMoveIndex({ direction: 'next', currentIndex: -1, lastIndex: 4 })).toBe(0)
    expect(resolveKeyboardMoveIndex({ direction: 'prev', currentIndex: -1, lastIndex: 4 })).toBe(0)
  })

  it('resolves first and last', () => {
    expect(resolveKeyboardMoveIndex({ direction: 'first', currentIndex: 3, lastIndex: 9 })).toBe(0)
    expect(resolveKeyboardMoveIndex({ direction: 'last', currentIndex: 3, lastIndex: 9 })).toBe(9)
  })
})
