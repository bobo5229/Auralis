import { describe, expect, it } from 'vitest'
import { resolveAlbumTrackPresentation } from './albumTrackPresentation'

describe('resolveAlbumTrackPresentation', () => {
  it('keeps the current track and search highlight independent', () => {
    expect(resolveAlbumTrackPresentation(7, 3, 0, 7, 7)).toEqual({
      displayNumber: 3,
      current: true,
      highlighted: true,
    })
    expect(resolveAlbumTrackPresentation(7, 3, 0, 9, 10)).toEqual({
      displayNumber: 3,
      current: false,
      highlighted: false,
    })
  })

  it('falls back to the one-based position when trackNo is missing', () => {
    expect(resolveAlbumTrackPresentation(7, null, 4, null, null).displayNumber).toBe(5)
  })
})
