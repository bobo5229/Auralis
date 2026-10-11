import { describe, expect, it } from 'vitest'
import {
  getAlbumGroupEstimatedHeight,
  LIBRARY_LAYOUT_CSS_VARS,
  LIBRARY_LAYOUT_METRICS,
} from './libraryLayoutMetrics'

describe('library layout geometry contract', () => {
  it('keeps the virtualized dimensions frozen to the shared metrics', () => {
    expect(LIBRARY_LAYOUT_METRICS).toMatchObject({
      flatSearchRowHeight: 48,
      flatHeaderHeight: 32,
      flatRowHeight: 48,
      flatArtworkSize: 44,
      flatRowsInset: 16,
      flatBottomInset: 28,
      coverArtworkSize: 280,
      coverTrackRowHeight: 48,
      coverDiscHeadingHeight: 24,
      coverContentTopInset: 16,
      coverPanelPaddingBlockSide: 0,
      coverPanelPaddingInlineSide: 10,
      coverPanelBorderWidth: 0,
      coverGroupPaddingBlockSide: 28,
    })
    expect(LIBRARY_LAYOUT_CSS_VARS['--library-flat-search-row-height']).toBe('48px')
    expect(LIBRARY_LAYOUT_CSS_VARS['--library-flat-header-height']).toBe('32px')
    expect(LIBRARY_LAYOUT_CSS_VARS['--library-flat-row-height']).toBe('48px')
    expect(LIBRARY_LAYOUT_CSS_VARS['--library-flat-artwork-size']).toBe('44px')
    expect(LIBRARY_LAYOUT_CSS_VARS['--library-cover-track-row-height']).toBe('48px')
    expect(LIBRARY_LAYOUT_CSS_VARS['--library-cover-disc-heading-height']).toBe('24px')
    expect(LIBRARY_LAYOUT_CSS_VARS['--library-cover-artwork-size']).toBe('280px')
    expect(LIBRARY_LAYOUT_CSS_VARS['--library-cover-panel-border-width']).toBe('0px')
    expect(LIBRARY_LAYOUT_CSS_VARS['--library-cover-panel-padding-block-side']).toBe('0px')
    expect(LIBRARY_LAYOUT_CSS_VARS['--library-cover-panel-padding-inline-side']).toBe('10px')
  })

  it('uses the cover column until the track panel becomes taller', () => {
    expect(getAlbumGroupEstimatedHeight(1, false)).toBe(389)
    expect(getAlbumGroupEstimatedHeight(1, true)).toBe(409)
    expect(getAlbumGroupEstimatedHeight(3, true, 2)).toBe(409)
    expect(getAlbumGroupEstimatedHeight(10, true)).toBe(537)
    expect(getAlbumGroupEstimatedHeight(10, true, 2)).toBe(561)
    expect(getAlbumGroupEstimatedHeight(10, true, 3)).toBe(585)
  })
})
