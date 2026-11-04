import { analyzeArtworkColors } from '../../src/renderer/shared/artwork/artworkAnalysis'
import { oklabToRgb } from '../../src/renderer/shared/color/colorMath'

/** Experimental only: use area with a stronger, bounded preference for saturated colors. */
export function vibrantAlbumColors(pixels: Uint8ClampedArray) {
  const analysis = analyzeArtworkColors(pixels)
  if (!analysis) return null
  const score = (color: (typeof analysis.colors)[number]) =>
    color.weight * (0.55 + 0.45 * Math.min(1, color.chroma / 0.12))
  const source = analysis.colors.reduce((best, color) =>
    score(color) > score(best) ? color : best,
  )
  const { a, b } = source.oklab
  const chroma = Math.hypot(a, b)
  // A near-neutral cover remains neutral; vivid covers keep more color than the current demo.
  const strength = chroma < 0.015 ? 0 : Math.min(1.3, 0.16 / chroma)
  const surface = (lightness: number) => {
    let scale = strength
    let color = oklabToRgb({ l: lightness, a: a * scale, b: b * scale })
    for (let i = 0; i < 12 && [color.r, color.g, color.b].some((v) => v <= 1 || v >= 254); i++) {
      scale *= 0.9
      color = oklabToRgb({ l: lightness, a: a * scale, b: b * scale })
    }
    return color
  }
  return { main: surface(0.56), side: surface(0.4) }
}
