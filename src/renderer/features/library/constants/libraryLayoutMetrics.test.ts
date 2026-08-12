import { describe, expect, it } from 'vitest'
import {
  getAlbumGroupEstimatedHeight,
  LIBRARY_LAYOUT_CSS_VARS,
  LIBRARY_LAYOUT_METRICS,
} from './libraryLayoutMetrics'

describe('library layout geometry contract', () => {
  it('keeps the virtualized dimensions frozen to the shared metrics', () => {
    expect(LIBRARY_LAYOUT_METRICS).toMatchObject({
      flatRowHeight: 44,
      flatArtworkSize: 44,
      coverArtworkSize: 250,
      coverTrackRowHeight: 40,
      coverPanelPaddingBlockSide: 10,
      coverGroupPaddingBlockSide: 28,
    })
    expect(LIBRARY_LAYOUT_CSS_VARS['--library-flat-row-height']).toBe('44px')
    expect(LIBRARY_LAYOUT_CSS_VARS['--library-cover-track-row-height']).toBe('40px')
    expect(LIBRARY_LAYOUT_CSS_VARS['--library-cover-artwork-size']).toBe('250px')
  })

  it('uses the cover column until the track panel becomes taller', () => {
    expect(getAlbumGroupEstimatedHeight(1, false)).toBe(359)
    expect(getAlbumGroupEstimatedHeight(1, true)).toBe(379)
    expect(getAlbumGroupEstimatedHeight(10, true)).toBe(479)
  })
})
