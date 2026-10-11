import { extractArtworkPalette } from '../../../playback/utils/extractArtworkPalette'
import { rgbToOklab, oklabToRgb } from '../../../../shared/color/colorMath'

type Lab = ReturnType<typeof rgbToOklab>
type Rgb = Parameters<typeof rgbToOklab>[0]
export interface BackgroundPalette {
  primary: Lab
  secondary: Lab
  accent: Lab
  swatches: string[]
  quality: 'cover' | 'neutral' | 'fallback'
}

const chroma = (color: Lab) => Math.hypot(color.a, color.b)
const distance = (a: Lab, b: Lab) => Math.hypot(a.a - b.a, a.b - b.b)
const mix = (start: number, end: number, weight: number) => start + (end - start) * weight
const smooth = (start: number, end: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)))
  return t * t * (3 - 2 * t)
}
const hex = ({ r, g, b }: Rgb) =>
  '#' + [r, g, b].map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')

export function neutralPalette(): BackgroundPalette {
  const gray = { l: 0.5, a: 0, b: 0 }
  return {
    primary: gray,
    secondary: gray,
    accent: gray,
    swatches: ['#808080'],
    quality: 'fallback',
  }
}

export function getRedSurfaceStrength(palette: BackgroundPalette): number {
  if (palette.quality !== 'cover') return 0
  const hue = (Math.atan2(palette.primary.b, palette.primary.a) * 180) / Math.PI
  const hueDistance = Math.abs(((hue - 20 + 540) % 360) - 180)
  return smooth(0.075, 0.14, chroma(palette.primary)) * (1 - smooth(8, 14, hueDistance))
}

function redSurfaceColor(palette: BackgroundPalette, source: Lab, strength: number): Lab {
  const hue = Math.atan2(palette.primary.b, palette.primary.a) - (8 * Math.PI) / 180
  const saturation = chroma(palette.primary)
  return {
    l: source.l,
    a: mix(source.a, Math.cos(hue) * saturation, strength),
    b: mix(source.b, Math.sin(hue) * saturation, strength),
  }
}

export function extractBackgroundPalette(cover: CanvasImageSource): BackgroundPalette {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 48
  const c = canvas.getContext('2d', { willReadFrequently: true })!
  c.drawImage(cover, 0, 0, 48, 48)
  const pixels = c.getImageData(0, 0, 48, 48).data
  if (!pixels.some((value, i) => i % 4 === 3 && value >= 128)) return neutralPalette()
  const result = extractArtworkPalette('startup-album-background', pixels)
  // Use source colours, before playback's accent saturation/lightness adjustment.
  const colors = result.accents
    .map((color) => ({
      rgb: color.sourceRgb ?? color.rgb,
      weight: color.weight,
    }))
    .sort((a, b) => b.weight - a.weight)
  const dominantRgb = result.dominant ?? colors[0]?.rgb
  if (!dominantRgb) return neutralPalette()
  const dominant = rgbToOklab(dominantRgb)
  const primaryColor = colors.find(
    (color) => color.weight >= 0.08 && chroma(rgbToOklab(color.rgb)) >= 0.025,
  )
  const primary = primaryColor ? rgbToOklab(primaryColor.rgb) : dominant
  const alternatives = colors.map((color) => rgbToOklab(color.rgb))
  const secondary =
    alternatives.find(
      (color) => distance(color, primary) > 0.01 && distance(color, primary) < 0.06,
    ) ?? primary
  const accent =
    alternatives.find(
      (color) => distance(color, primary) > 0.035 && distance(color, secondary) > 0.035,
    ) ?? secondary
  const neutral = alternatives.every((color) => chroma(color) < 0.02)
  return {
    primary: neutral ? { ...primary, a: 0, b: 0 } : primary,
    secondary: neutral ? { ...secondary, a: 0, b: 0 } : secondary,
    accent: neutral ? { ...accent, a: 0, b: 0 } : accent,
    swatches: colors.map((color) => hex(color.rgb)),
    quality: neutral ? 'neutral' : 'cover',
  }
}

function displayColor(source: Lab, lightness: number, maxChroma: number, alpha: number) {
  const scale = Math.min(1.1, maxChroma / Math.max(chroma(source), 0.0001))
  let a = source.a * scale,
    b = source.b * scale
  // Reduce chroma at fixed lightness when RGB clipping would flatten the gradient.
  let rgb = oklabToRgb({ l: lightness, a, b })
  for (let i = 0; i < 8 && [rgb.r, rgb.g, rgb.b].some((value) => value <= 1 || value >= 254); i++) {
    a *= 0.8
    b *= 0.8
    rgb = oklabToRgb({ l: lightness, a, b })
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

// Existing design colours are lightness/chroma templates only. Their hue routes
// each surface to one of the cover's colour roles; no fixed blue survives mapping.
export function tone(
  palette: BackgroundPalette,
  template: string,
  purpose: 'surface' | 'bright-surface' | 'shadow' = 'surface',
) {
  const r = parseInt(template.slice(1, 3), 16)
  const g = parseInt(template.slice(3, 5), 16)
  const b = parseInt(template.slice(5, 7), 16)
  const reference = rgbToOklab({ r, g, b })
  const role = r > b ? 'accent' : b > g * 1.2 && r > g * 0.95 ? 'secondary' : 'primary'
  const alpha = template.length === 9 ? parseInt(template.slice(7, 9), 16) / 255 : 1
  // The paper studies normally use a light substrate. Saturated red instead
  // retains a deeper red scale and higher chroma, rather than turning pink.
  if (purpose === 'bright-surface') {
    const red = getRedSurfaceStrength(palette)
    return displayColor(
      redSurfaceColor(palette, palette[role], red),
      mix(0.58 + reference.l * 0.36, 0.3 + reference.l * 0.32, red),
      mix(Math.max(0.055, Math.min(0.12, chroma(reference) * 1.2)), 0.13 + reference.l * 0.05, red),
      alpha,
    )
  }
  // Lift the printed midtones, retaining hue/chroma and highlight headroom.
  // Shadows use their original lightness, rather than lifting every dark pixel.
  const lift =
    purpose === 'surface'
      ? 0.18 * smooth(0.08, 0.22, reference.l) * (1 - smooth(0.6, 0.88, reference.l))
      : 0
  return displayColor(palette[role], reference.l + lift, Math.max(0.018, chroma(reference)), alpha)
}

export function ribbonColor(palette: BackgroundPalette, t: number, alpha: number, study = false) {
  const start = t < 0.5 ? palette.primary : palette.secondary
  const end = t < 0.5 ? palette.secondary : palette.accent
  const blend = t < 0.5 ? t * 2 : (t - 0.5) * 2
  const red = study ? getRedSurfaceStrength(palette) : 0
  return displayColor(
    redSurfaceColor(
      palette,
      { l: 0.7, a: mix(start.a, end.a, blend), b: mix(start.b, end.b, blend) },
      red,
    ),
    mix(0.7 + Math.sin(t * Math.PI) * 0.12, 0.44 + Math.sin(t * Math.PI) * 0.1, red),
    mix(0.09, 0.16, red),
    alpha,
  )
}
