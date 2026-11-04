import { analyzeArtworkColors } from '../../src/renderer/shared/artwork/artworkAnalysis'
import { rgbToOklab, oklabToRgb, getContrastRatio } from '../../src/renderer/shared/color/colorMath'

/** Demo-only surface mapping: retain the source's lightness and chroma where possible. */
export function vibrantAlbumColors(pixels: Uint8ClampedArray) {
  const analysis = analyzeArtworkColors(pixels)
  if (!analysis) return null
  const source = analysis.dominant.rgb
  const lab = rgbToOklab(source)
  const mainLightness = Math.max(0.32, Math.min(0.9, lab.l))
  const sideLightness = Math.max(0.2, mainLightness - 0.08)
  const surface = (l: number) => {
    let scale = 1
    let color = oklabToRgb({ l, a: lab.a, b: lab.b })
    for (let i = 0; i < 12 && [color.r, color.g, color.b].some(v => v <= 1 || v >= 254); i++) {
      scale *= 0.9
      color = oklabToRgb({ l, a: lab.a * scale, b: lab.b * scale })
    }
    return color
  }
  // Preserve the former production mapping for a stable before/after comparison.
  const chroma = Math.hypot(lab.a, lab.b)
  const strength = chroma < 0.015 ? 0 : Math.min(1.3, 0.16 / chroma)
  const oldSurface = (l: number) => {
    let scale = strength
    let color = oklabToRgb({ l, a: lab.a * scale, b: lab.b * scale })
    for (let i = 0; i < 12 && [color.r, color.g, color.b].some((v) => v <= 1 || v >= 254); i++) {
      scale *= 0.9
      color = oklabToRgb({ l, a: lab.a * scale, b: lab.b * scale })
    }
    return color
  }
  let oldLightness = 0.56
  let oldMain = oldSurface(oldLightness)
  while (oldLightness > 0.49 && getContrastRatio({ r: 255, g: 255, b: 255 }, oldMain) < 4.5) {
    oldLightness -= 0.005
    oldMain = oldSurface(oldLightness)
  }
  return {
    gentle: { main: surface(mainLightness), side: surface(sideLightness) },
    current: { main: oldMain, side: oldSurface(0.4) },
  }
}
