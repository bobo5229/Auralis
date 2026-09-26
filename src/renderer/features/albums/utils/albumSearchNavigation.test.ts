import { describe, expect, it } from 'vitest'
import { resolveNextAlbumSearchMatch } from './albumSearchNavigation'

describe('resolveNextAlbumSearchMatch', () => {
  it('returns no target when there are no matches', () => {
    expect(resolveNextAlbumSearchMatch([], -1, true)).toEqual({
      targetIndex: null,
      matchPosition: null,
      totalMatches: 0,
      wrapped: false,
    })
  })

  it('advances through matches without wrapping', () => {
    expect(resolveNextAlbumSearchMatch([1, 4, 9], 1, false)).toEqual({
      targetIndex: 4,
      matchPosition: 2,
      totalMatches: 3,
      wrapped: false,
    })
  })

  it('wraps to the first match after the final result', () => {
    expect(resolveNextAlbumSearchMatch([1, 4, 9], 9, false)).toEqual({
      targetIndex: 1,
      matchPosition: 1,
      totalMatches: 3,
      wrapped: true,
    })
  })

  it('re-evaluates from the first match when isNewQuery is true after query change or reset', () => {
    // Previous search ended at index 4 (matchPosition 2 of 3)
    // After modifying query, lastMatchedIndex resets to -1 and isNewQuery is true
    expect(resolveNextAlbumSearchMatch([0, 2], -1, true)).toEqual({
      targetIndex: 0,
      matchPosition: 1,
      totalMatches: 2,
      wrapped: false,
    })
  })

  it('re-evaluates from the first match when catalog data is updated and reset', () => {
    // After catalog data update, matching indices changed and search state was reset
    const newMatchingIndices = [3, 7]
    const firstMatch = resolveNextAlbumSearchMatch(newMatchingIndices, -1, true)
    expect(firstMatch).toEqual({
      targetIndex: 3,
      matchPosition: 1,
      totalMatches: 2,
      wrapped: false,
    })

    // Consecutive Enter advances to next match
    const secondMatch = resolveNextAlbumSearchMatch(newMatchingIndices, 3, false)
    expect(secondMatch).toEqual({
      targetIndex: 7,
      matchPosition: 2,
      totalMatches: 2,
      wrapped: false,
    })

    // Further Enter cycles back
    const wrapMatch = resolveNextAlbumSearchMatch(newMatchingIndices, 7, false)
    expect(wrapMatch).toEqual({
      targetIndex: 3,
      matchPosition: 1,
      totalMatches: 2,
      wrapped: true,
    })
  })
})

