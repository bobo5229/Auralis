import { describe, expect, it } from 'vitest'
import {
  MODERN_PLAYER_BAR_BOTTOM_GAP_PX,
  MODERN_PLAYER_BAR_COLUMN_INSET_PX,
  MODERN_PLAYER_BAR_HEIGHT_PX,
  MODERN_PLAYER_BAR_MAX_WIDTH_PX,
  MODERN_PLAYER_BAR_SUBTITLE_COLLAPSE_MAX_PX,
  MODERN_PLAYER_BAR_UTILITIES_OVERFLOW_MAX_PX,
  MODERN_PLAYER_BAR_VOLUME_COLLAPSE_MAX_PX,
  resolveModernPlayerBarIslandWidthPx,
  resolveModernPlayerBarSafeAreaPx,
  shouldCollapseModernInlineVolume,
  shouldHideModernSubtitle,
  shouldOverflowModernUtilities,
} from './modernPlayerBarLayout'

describe('modernPlayerBarLayout', () => {
  it('encodes the floating-island geometry contract', () => {
    expect(MODERN_PLAYER_BAR_HEIGHT_PX).toBe(72)
    expect(MODERN_PLAYER_BAR_BOTTOM_GAP_PX).toBe(24)
    expect(MODERN_PLAYER_BAR_MAX_WIDTH_PX).toBe(920)
    expect(MODERN_PLAYER_BAR_COLUMN_INSET_PX).toBe(24)
    expect(resolveModernPlayerBarSafeAreaPx()).toBe(
      MODERN_PLAYER_BAR_HEIGHT_PX + MODERN_PLAYER_BAR_BOTTOM_GAP_PX,
    )
    expect(resolveModernPlayerBarSafeAreaPx()).toBe(96)
  })

  it('caps the island at the max width and keeps 24px side gaps', () => {
    expect(resolveModernPlayerBarIslandWidthPx(1000)).toBe(MODERN_PLAYER_BAR_MAX_WIDTH_PX)
    expect(resolveModernPlayerBarIslandWidthPx(968)).toBe(MODERN_PLAYER_BAR_MAX_WIDTH_PX)
    expect(resolveModernPlayerBarIslandWidthPx(800)).toBe(
      800 - MODERN_PLAYER_BAR_COLUMN_INSET_PX * 2,
    )
    expect(resolveModernPlayerBarIslandWidthPx(0)).toBe(0)
    expect(resolveModernPlayerBarIslandWidthPx(Number.NaN)).toBe(0)
  })

  it('collapses the inline volume slider at or below 800px', () => {
    expect(shouldCollapseModernInlineVolume(MODERN_PLAYER_BAR_VOLUME_COLLAPSE_MAX_PX)).toBe(true)
    expect(shouldCollapseModernInlineVolume(MODERN_PLAYER_BAR_VOLUME_COLLAPSE_MAX_PX - 1)).toBe(
      true,
    )
    expect(shouldCollapseModernInlineVolume(MODERN_PLAYER_BAR_VOLUME_COLLAPSE_MAX_PX + 1)).toBe(
      false,
    )
    expect(MODERN_PLAYER_BAR_VOLUME_COLLAPSE_MAX_PX).toBe(800)
  })

  it('hides the subtitle at or below 720px', () => {
    expect(shouldHideModernSubtitle(MODERN_PLAYER_BAR_SUBTITLE_COLLAPSE_MAX_PX)).toBe(true)
    expect(shouldHideModernSubtitle(MODERN_PLAYER_BAR_SUBTITLE_COLLAPSE_MAX_PX - 1)).toBe(true)
    expect(shouldHideModernSubtitle(MODERN_PLAYER_BAR_SUBTITLE_COLLAPSE_MAX_PX + 1)).toBe(false)
    expect(MODERN_PLAYER_BAR_SUBTITLE_COLLAPSE_MAX_PX).toBe(720)
  })

  it('moves lyrics and mode behind overflow at or below 640px', () => {
    expect(shouldOverflowModernUtilities(MODERN_PLAYER_BAR_UTILITIES_OVERFLOW_MAX_PX)).toBe(true)
    expect(shouldOverflowModernUtilities(MODERN_PLAYER_BAR_UTILITIES_OVERFLOW_MAX_PX - 1)).toBe(
      true,
    )
    expect(shouldOverflowModernUtilities(MODERN_PLAYER_BAR_UTILITIES_OVERFLOW_MAX_PX + 1)).toBe(
      false,
    )
    expect(MODERN_PLAYER_BAR_UTILITIES_OVERFLOW_MAX_PX).toBe(640)
  })
})
