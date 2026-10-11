/** Shared by shell and player-bar island measurements; matches the CSS width cap. */
export const MODERN_PLAYER_BAR_MAX_WIDTH_PX = 700

export const MODERN_PLAYER_BAR_UTILITIES_OVERFLOW_MAX_PX = 640

export function shouldOverflowModernUtilities(islandInlineSizePx: number): boolean {
  return islandInlineSizePx <= MODERN_PLAYER_BAR_UTILITIES_OVERFLOW_MAX_PX
}
