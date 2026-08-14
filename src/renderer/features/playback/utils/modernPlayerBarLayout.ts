/**
 * Modern floating-island PlayerBar layout constants.
 * CSS container queries must stay in lockstep with these values.
 */
export const MODERN_PLAYER_BAR_HEIGHT_PX = 72

/** Bottom gap under the floating island (px). Safe area = height + gap. */
export const MODERN_PLAYER_BAR_BOTTOM_GAP_PX = 24

export const MODERN_PLAYER_BAR_MAX_WIDTH_PX = 920

export const MODERN_PLAYER_BAR_COLUMN_INSET_PX = 24

export const MODERN_PLAYER_BAR_VOLUME_COLLAPSE_MAX_PX = 800

export const MODERN_PLAYER_BAR_SUBTITLE_COLLAPSE_MAX_PX = 720

export const MODERN_PLAYER_BAR_UTILITIES_OVERFLOW_MAX_PX = 640

export function resolveModernPlayerBarSafeAreaPx(): number {
  return MODERN_PLAYER_BAR_HEIGHT_PX + MODERN_PLAYER_BAR_BOTTOM_GAP_PX
}

export function resolveModernPlayerBarIslandWidthPx(mainColumnInlineSizePx: number): number {
  if (!Number.isFinite(mainColumnInlineSizePx) || mainColumnInlineSizePx <= 0) {
    return 0
  }

  return Math.min(
    MODERN_PLAYER_BAR_MAX_WIDTH_PX,
    Math.max(0, mainColumnInlineSizePx - MODERN_PLAYER_BAR_COLUMN_INSET_PX * 2),
  )
}

export function shouldCollapseModernInlineVolume(islandInlineSizePx: number): boolean {
  return islandInlineSizePx <= MODERN_PLAYER_BAR_VOLUME_COLLAPSE_MAX_PX
}

export function shouldHideModernSubtitle(islandInlineSizePx: number): boolean {
  return islandInlineSizePx <= MODERN_PLAYER_BAR_SUBTITLE_COLLAPSE_MAX_PX
}

export function shouldOverflowModernUtilities(islandInlineSizePx: number): boolean {
  return islandInlineSizePx <= MODERN_PLAYER_BAR_UTILITIES_OVERFLOW_MAX_PX
}
