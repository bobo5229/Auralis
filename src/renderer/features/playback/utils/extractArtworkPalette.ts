import type { ArtworkPalette, OklabColor, PaletteColor } from '../types'
import {
  analyzeArtworkColors,
  MAX_ARTWORK_COLORS,
  type ArtworkColor,
} from '@renderer/shared/artwork/artworkAnalysis'
import { oklabToRgb, getOklabChroma } from '@renderer/shared/color/colorMath'
import { FALLBACK_PALETTE } from './artworkPaletteDefaults'

export { FALLBACK_PALETTE } from './artworkPaletteDefaults'

function fitDisplayColor(color: OklabColor, lightness: number, chromaBoost = 1): OklabColor {
  let a = color.a * chromaBoost
  let b = color.b * chromaBoost
  let result = oklabToRgb({ l: lightness, a, b })

  for (let i = 0; i < 8; i += 1) {
    if (
      result.r > 1 &&
      result.r < 254 &&
      result.g > 1 &&
      result.g < 254 &&
      result.b > 1 &&
      result.b < 254
    ) {
      break
    }
    a *= 0.9
    b *= 0.9
    result = oklabToRgb({ l: lightness, a, b })
  }

  return { l: lightness, a, b }
}

function selectAccents(selected: ArtworkColor[]): PaletteColor[] {
  return selected.map((color) => {
    const displayOklab = fitDisplayColor(
      color.oklab,
      Math.min(0.64, Math.max(0.3, color.oklab.l)),
      1.35,
    )
    return {
      ...color,
      sourceRgb: color.rgb,
      oklab: displayOklab,
      rgb: oklabToRgb(displayOklab),
      chroma: getOklabChroma(displayOklab),
    }
  })
}

export function extractArtworkPalette(key: string, pixels: Uint8ClampedArray): ArtworkPalette {
  const analysis = analyzeArtworkColors(pixels)
  if (!analysis) return { ...FALLBACK_PALETTE, key }
  const accents = selectAccents(analysis.colors)
  const dominant = analysis.dominant
  const backgroundOklab = fitDisplayColor(
    dominant.oklab,
    Math.min(0.18, Math.max(0.08, dominant.oklab.l * 0.26)),
  )
  return {
    key,
    dominant: dominant.rgb,
    background: oklabToRgb(backgroundOklab),
    accents,
    textTone: 'light',
    quality: accents.length === MAX_ARTWORK_COLORS ? 'full' : 'reduced',
  }
}
