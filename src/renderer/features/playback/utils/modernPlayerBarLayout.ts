/** Shared by shell and player-bar island measurements; matches the CSS width cap. */
export const MODERN_PLAYER_BAR_MAX_WIDTH_PX = 760

export const MODERN_PLAYER_BAR_UTILITIES_OVERFLOW_MAX_PX = 640

// 16px side insets, 120px centered transport, two 12px gutters, and two
// equal side columns of 168px keep the docked groups at least 12px apart.
export const DOCKED_PLAYER_BAR_UTILITIES_OVERFLOW_BELOW_PX = 512

export function shouldOverflowDockedUtilities(inlineSizePx: number): boolean {
  return inlineSizePx < DOCKED_PLAYER_BAR_UTILITIES_OVERFLOW_BELOW_PX
}

export function shouldOverflowModernUtilities(islandInlineSizePx: number): boolean {
  return islandInlineSizePx <= MODERN_PLAYER_BAR_UTILITIES_OVERFLOW_MAX_PX
}
