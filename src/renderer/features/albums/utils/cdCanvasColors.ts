import type { ArtworkPalette, RgbColor } from '@renderer/features/playback/types'
import type { DeepReadonly } from 'vue'
import {
  rgbToOklab,
  oklabToRgb,
  getOklabDistance,
} from '@renderer/features/playback/utils/colorSpace'
import { getContrastRatio } from '@renderer/shared/color/colorMath'

export const CD_LIGHT_BACKGROUND: RgbColor = { r: 238, g: 238, b: 236 }
export const CD_DARK_BACKGROUND: RgbColor = { r: 43, g: 45, b: 48 }
const BLACK: RgbColor = { r: 0, g: 0, b: 0 }
const WHITE: RgbColor = { r: 255, g: 255, b: 255 }

export function formatCdColor(color: RgbColor): string {
  return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`
}

export function mixCdColor(from: RgbColor, to: RgbColor, progress: number): RgbColor {
  return {
    r: Math.round(from.r + (to.r - from.r) * progress),
    g: Math.round(from.g + (to.g - from.g) * progress),
    b: Math.round(from.b + (to.b - from.b) * progress),
  }
}

export function cdColorContrast(a: RgbColor, b: RgbColor): number {
  return getContrastRatio(a, b)
}

/** Preserve the cover hue where possible, including every intermediate animation frame. */
export function readableCdColor(source: RgbColor, background: RgbColor, minimum = 4.5): RgbColor {
  const endpoint =
    cdColorContrast(BLACK, background) >= cdColorContrast(WHITE, background) ? BLACK : WHITE
  for (let step = 0; step <= 32; step++) {
    const color = mixCdColor(source, endpoint, step / 32)
    if (cdColorContrast(color, background) >= minimum) return color
  }
  return endpoint
}

export function resolveCdCanvasBackground(palette: DeepReadonly<ArtworkPalette>): RgbColor | null {
  if (palette.quality === 'fallback') return null
  const accent = palette.accents.find((color) => color.chroma >= 0.035)
  // Monochrome covers retain the shared palette's area-color fallback.
  const source =
    accent?.sourceRgb ??
    accent?.rgb ??
    palette.dominant ??
    [...palette.accents].sort((a, b) => b.weight - a.weight)[0]?.rgb
  if (!source) return null
  const lab = rgbToOklab(source)
  const chroma = Math.hypot(lab.a, lab.b)
  const scale = chroma > 0 ? Math.min(1.05, 0.21 / chroma) : 0
  const canvas = {
    // Deepen the focused canvas slightly so cover artwork stands out against its own hue.
    l: Math.max(0.72, Math.min(0.88, lab.l)) - 0.05,
    a: lab.a * scale,
    b: lab.b * scale,
  }
  // Fit bright colors to sRGB by reducing chroma, preserving hue and lightness.
  for (let step = 0; step < 16; step++) {
    const rgb = oklabToRgb(canvas)
    if (getOklabDistance(canvas, rgbToOklab(rgb)) < 0.004) return rgb
    canvas.a *= 0.9
    canvas.b *= 0.9
  }
  return oklabToRgb(canvas)
}

export function cdCanvasColorTokens(
  background: RgbColor,
  accent: RgbColor | null,
): Record<string, string> {
  const darkText = cdColorContrast(BLACK, background) >= cdColorContrast(WHITE, background)
  const endpoint = darkText ? BLACK : WHITE
  const text = (amount: number, minimum = 4.5): string =>
    formatCdColor(readableCdColor(mixCdColor(background, endpoint, amount), background, minimum))
  const primary = text(0.92)
  const muted = text(0.72)
  const subtle = text(0.58)
  const border = text(0.45, 3)
  const readableAccent = formatCdColor(
    readableCdColor(accent ?? mixCdColor(background, endpoint, 0.72), background),
  )
  return {
    '--cd-bg': formatCdColor(background),
    '--cd-text': primary,
    '--cd-text-muted': muted,
    '--cd-text-subtle': subtle,
    '--cd-text-faint': subtle,
    '--cd-text-count': muted,
    '--cd-text-browsing': primary,
    '--cd-text-album': muted,
    '--cd-border': border,
    '--cd-border-strong': muted,
    '--cd-info-title-border': primary,
    '--cd-border-row': border,
    '--cd-border-track': `rgb(from ${border} r g b / 0.3)`,
    '--cd-hover-bg': formatCdColor(mixCdColor(background, darkText ? WHITE : BLACK, 0.08)),
    '--cd-focus-ring': primary,
    '--cd-wave-track': border,
    '--cd-wave-progress': muted,
    '--cd-wave-accent': readableAccent,
    '--cd-progress-fill': primary,
    '--cd-shimmer-a': subtle,
    '--cd-shimmer-b': muted,
    '--cd-shimmer-c': primary,
    '--cd-error': formatCdColor(readableCdColor({ r: 160, g: 60, b: 50 }, background)),
    '--cd-lyrics-color': readableAccent,
  }
}
