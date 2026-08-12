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
})
