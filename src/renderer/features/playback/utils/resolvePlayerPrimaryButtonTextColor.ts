import type { RgbColor } from '../types'

export const PLAYER_PRIMARY_BUTTON_DARK_TEXT = '#1f1f1f'
export const PLAYER_PRIMARY_BUTTON_LIGHT_TEXT = '#ffffff'

function clampChannel(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(255, Math.max(0, value))
}

function toLinearSrgb(channel: number): number {
  const normalized = clampChannel(channel) / 255
  return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4)
}

export function getRelativeLuminance(color: RgbColor): number {
  return (
    0.2126 * toLinearSrgb(color.r) + 0.7152 * toLinearSrgb(color.g) + 0.0722 * toLinearSrgb(color.b)
  )
}

function getContrastRatio(first: RgbColor, second: RgbColor): number {
  const firstLuminance = getRelativeLuminance(first)
  const secondLuminance = getRelativeLuminance(second)
  const lighter = Math.max(firstLuminance, secondLuminance)
  const darker = Math.min(firstLuminance, secondLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

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
