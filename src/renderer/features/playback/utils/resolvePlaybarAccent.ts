import type { RgbColor } from '../types'
import { getRelativeLuminance } from './resolvePlayerPrimaryButtonTextColor'

// Conservative upper bound for the dark surface, including tint and control highlights.
// Keep in sync with the scoped PlayerBar material rules in main.css.
export const PLAYBAR_DARK_SURFACE_BOUND: RgbColor = { r: 96, g: 96, b: 96 }
export const PLAYBAR_LIGHT_SURFACE_BOUND: RgbColor = { r: 247, g: 247, b: 244 }
export const PLAYBAR_SURFACE_BOUND = PLAYBAR_DARK_SURFACE_BOUND

// #8FA7BB — unified dark-skin interactive accent fallback when artwork color is unusable.
const DARK_FALLBACK: RgbColor = { r: 143, g: 167, b: 187 }
// #788779 — unified light-skin interactive accent fallback (Sage Green).
const LIGHT_FALLBACK: RgbColor = { r: 120, g: 135, b: 121 }

/** Functional graphics need 3:1 contrast; text uses stable neutral tokens instead. */
export function resolvePlaybarAccent(color?: RgbColor | null, isDark = true): RgbColor {
  const fallback = isDark ? DARK_FALLBACK : LIGHT_FALLBACK
  if (!color || !Object.values(color).every(Number.isFinite)) return { ...fallback }
  const source = {
    r: Math.round(Math.max(0, Math.min(255, color.r))),
    g: Math.round(Math.max(0, Math.min(255, color.g))),
    b: Math.round(Math.max(0, Math.min(255, color.b))),
  }

  if (isDark) {
    const minimumLuminance = (getRelativeLuminance(PLAYBAR_DARK_SURFACE_BOUND) + 0.05) * 3 - 0.05
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
  } else {
    const surfaceLuminance = getRelativeLuminance(PLAYBAR_LIGHT_SURFACE_BOUND)
    // Darken/mix towards deep shade to maintain at least 3:1 contrast against light surface.
    for (let step = 0; step <= 100; step++) {
      const amount = step / 100
      const candidate = {
        r: Math.round(source.r * (1 - amount)),
        g: Math.round(source.g * (1 - amount)),
        b: Math.round(source.b * (1 - amount)),
      }
      const candidateLuminance = getRelativeLuminance(candidate)
      const contrast = (surfaceLuminance + 0.05) / (candidateLuminance + 0.05)
      if (contrast >= 3) return candidate
    }
  }

  return { ...fallback }
}
