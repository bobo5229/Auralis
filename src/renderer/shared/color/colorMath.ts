import {
  convertHslToRgb,
  convertOklabToRgb,
  convertRgbToHsl,
  convertRgbToLrgb,
  convertRgbToOklab,
  wcagContrast,
  wcagLuminance,
} from 'culori/fn'
import type { Hsl, Oklab, Rgb } from 'culori/fn'

type RgbChannels = Pick<Rgb, 'r' | 'g' | 'b'>
type OklabChannels = Pick<Oklab, 'l' | 'a' | 'b'>

// Auralis uses 0–255 RGB channels; Culori uses normalized 0–1 channels.
function normalizedRgb(color: RgbChannels): Rgb {
  return { mode: 'rgb', r: color.r / 255, g: color.g / 255, b: color.b / 255 }
}

function byteRgb(color: Rgb): RgbChannels {
  const channel = (value: number): number => Math.round(Math.min(1, Math.max(0, value)) * 255)
  return { r: channel(color.r), g: channel(color.g), b: channel(color.b) }
}

export function rgbToOklab(color: RgbChannels): OklabChannels {
  const { l, a, b } = convertRgbToOklab(normalizedRgb(color))
  return { l, a, b }
}

export function oklabToRgb(color: OklabChannels): RgbChannels {
  // Preserve channel clipping instead of changing the product's chroma-fitting rules.
  return byteRgb(convertOklabToRgb(color))
}

export function rgbToHsl(color: RgbChannels): Hsl {
  return convertRgbToHsl(normalizedRgb(color))
}

export function hslToRgb(color: Hsl): RgbChannels {
  return byteRgb(convertHslToRgb(color))
}

function linearRgbForContrast(color: RgbChannels) {
  const channel = (value: number): number =>
    Number.isFinite(value) ? Math.min(255, Math.max(0, value)) / 255 : 0
  // Supplying linear RGB directly keeps the WCAG helpers independent of Culori's
  // global color-mode registry, including when this module runs in a Worker.
  return convertRgbToLrgb({ r: channel(color.r), g: channel(color.g), b: channel(color.b) })
}

export function getRelativeLuminance(color: RgbChannels): number {
  return wcagLuminance(linearRgbForContrast(color))
}

export function getContrastRatio(first: RgbChannels, second: RgbChannels): number {
  return wcagContrast(linearRgbForContrast(first), linearRgbForContrast(second))
}
