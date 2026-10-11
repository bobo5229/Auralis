import type { RgbColor } from '@renderer/features/playback/types'
import { getContrastRatio } from '@renderer/shared/color/colorMath'

export const CD_LIGHT_BACKGROUND: RgbColor = { r: 238, g: 238, b: 236 }
export const CD_DARK_BACKGROUND: RgbColor = { r: 43, g: 45, b: 48 }
const BLACK: RgbColor = { r: 0, g: 0, b: 0 }
const WHITE: RgbColor = { r: 255, g: 255, b: 255 }

export function formatCdColor(color: RgbColor): string {
  return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`
}

function mixCdColor(from: RgbColor, to: RgbColor, progress: number): RgbColor {
  return {
    r: Math.round(from.r + (to.r - from.r) * progress),
    g: Math.round(from.g + (to.g - from.g) * progress),
    b: Math.round(from.b + (to.b - from.b) * progress),
  }
}

function cdColorContrast(a: RgbColor, b: RgbColor): number {
  return getContrastRatio(a, b)
}

/** Preserve the cover hue where possible when fitting lyrics color to the canvas. */
export function readableCdColor(source: RgbColor, background: RgbColor, minimum = 4.5): RgbColor {
  const endpoint =
    cdColorContrast(BLACK, background) >= cdColorContrast(WHITE, background) ? BLACK : WHITE
  for (let step = 0; step <= 32; step++) {
    const color = mixCdColor(source, endpoint, step / 32)
    if (cdColorContrast(color, background) >= minimum) return color
  }
  return endpoint
}
