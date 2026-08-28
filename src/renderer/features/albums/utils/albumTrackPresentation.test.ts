import { describe, expect, it } from 'vitest'
import { resolveAlbumTrackPresentation } from './albumTrackPresentation'

describe('resolveAlbumTrackPresentation', () => {
  it('keeps selection, playback, and search highlight independent', () => {
    expect(resolveAlbumTrackPresentation(7, 3, 0, 7, 7, 7)).toEqual({
      displayNumber: 3,
      selected: true,
      playing: true,
      highlighted: true,
    })
    expect(resolveAlbumTrackPresentation(7, 3, 0, 8, 9, 10)).toEqual({
      displayNumber: 3,
      selected: false,
      playing: false,
      highlighted: false,
    })
  })

  it('falls back to the one-based position when trackNo is missing', () => {
    expect(resolveAlbumTrackPresentation(7, null, 4, null, null, null).displayNumber).toBe(5)
  })
})
