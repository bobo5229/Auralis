import type { RgbColor } from '@renderer/shared/color/types'
import { getContrastRatio } from '@renderer/shared/color/colorMath'

export { getRelativeLuminance } from '@renderer/shared/color/colorMath'

export const ARTWORK_PRIMARY_BUTTON_DARK_TEXT = '#1f1f1f'
export const ARTWORK_PRIMARY_BUTTON_LIGHT_TEXT = '#ffffff'

const DARK_TEXT_RGB: RgbColor = { r: 31, g: 31, b: 31 }
const LIGHT_TEXT_RGB: RgbColor = { r: 255, g: 255, b: 255 }

/**
 * Chooses the more legible of the two fixed artwork-button foregrounds for a
 * final sRGB accent.  The accent itself is deliberately left untouched.
 */
export function resolveArtworkButtonTextColor(color: RgbColor): string {
  return getContrastRatio(DARK_TEXT_RGB, color) >= getContrastRatio(LIGHT_TEXT_RGB, color)
    ? ARTWORK_PRIMARY_BUTTON_DARK_TEXT
    : ARTWORK_PRIMARY_BUTTON_LIGHT_TEXT
}
