import type { RgbColor } from '../types'
import { getContrastRatio } from '@renderer/shared/color/colorMath'

export { getRelativeLuminance } from '@renderer/shared/color/colorMath'

export const PLAYER_PRIMARY_BUTTON_DARK_TEXT = '#1f1f1f'
export const PLAYER_PRIMARY_BUTTON_LIGHT_TEXT = '#ffffff'

const DARK_TEXT_RGB: RgbColor = { r: 31, g: 31, b: 31 }
const LIGHT_TEXT_RGB: RgbColor = { r: 255, g: 255, b: 255 }

/**
 * Chooses the more legible of the two fixed player-button foregrounds for a
 * final sRGB accent.  The accent itself is deliberately left untouched.
 */
export function resolvePlayerPrimaryButtonTextColor(color: RgbColor): string {
  return getContrastRatio(DARK_TEXT_RGB, color) >= getContrastRatio(LIGHT_TEXT_RGB, color)
    ? PLAYER_PRIMARY_BUTTON_DARK_TEXT
    : PLAYER_PRIMARY_BUTTON_LIGHT_TEXT
}
