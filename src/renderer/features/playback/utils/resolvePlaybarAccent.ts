import type { RgbColor } from '../types'
import { getRelativeLuminance } from './resolvePlayerPrimaryButtonTextColor'

// Conservative upper bound for the dark surface, including tint and control highlights.
// Keep in sync with the scoped PlayerBar material rules in main.css.
export const PLAYBAR_SURFACE_BOUND: RgbColor = { r: 96, g: 96, b: 96 }
const FALLBACK: RgbColor = { r: 225, g: 221, b: 214 }

/** Functional graphics need 3:1 contrast; text uses stable neutral tokens instead. */
export function resolvePlaybarAccent(color?: RgbColor | null): RgbColor {
  if (!color || !Object.values(color).every(Number.isFinite)) return { ...FALLBACK }
  const source = {
    r: Math.round(Math.max(0, Math.min(255, color.r))),
    g: Math.round(Math.max(0, Math.min(255, color.g))),
    b: Math.round(Math.max(0, Math.min(255, color.b))),
  }
  const minimumLuminance = (getRelativeLuminance(PLAYBAR_SURFACE_BOUND) + 0.05) * 3 - 0.05
  // Mix towards white, keeping the source hue while lifting dark/saturated artwork colors.
  for (let step = 0; step <= 100; step++) {
    const amount = step / 100
    const candidate = {
      r: Math.round(source.r + (255 - source.r) * amount),
      g: Math.round(source.g + (255 - source.g) * amount),
      b: Math.round(source.b + (255 - source.b) * amount),
    }
    if (getRelativeLuminance(candidate) >= minimumLuminance) return candidate
  }
  return { ...FALLBACK }
}
