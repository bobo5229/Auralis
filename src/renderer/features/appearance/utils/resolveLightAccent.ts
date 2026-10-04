import type { RgbColor } from '@renderer/features/playback/types'
import { getContrastRatio as contrastRatio } from '@renderer/shared/color/colorMath'
import { DEFAULT_LIGHT_ACCENT, DEFAULT_LIGHT_ACCENT_SOFT } from '../constants/lightAccent'
import { normalizeDarkAccent } from './resolveDarkAccent'

const LIGHT_ACCENT_SURFACES = ['#F0F1F2', '#E7E9EB', '#F8F9FA', '#FFFFFF'] as const
const LIGHT_ACCENT_SOFT_SURFACE = '#F8F9FA'
const TEXT_CONTRAST_TARGET = 4.5

export interface LightAccentResolution {
  source: string
  display: string
  soft: string
  onAccent: string
  darkened: boolean
}

function rgbFromHex(hex: string): RgbColor {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  }
}

function toHex(color: RgbColor): string {
  const channel = (value: number): string => Math.round(value).toString(16).padStart(2, '0')
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`.toUpperCase()
}

function mixColors(base: RgbColor, overlay: RgbColor, overlayStrength: number): RgbColor {
  return {
    r: base.r * (1 - overlayStrength) + overlay.r * overlayStrength,
    g: base.g * (1 - overlayStrength) + overlay.g * overlayStrength,
    b: base.b * (1 - overlayStrength) + overlay.b * overlayStrength,
  }
}

function softForAccent(accentHex: string): string {
  if (accentHex === DEFAULT_LIGHT_ACCENT) return DEFAULT_LIGHT_ACCENT_SOFT
  return toHex(mixColors(rgbFromHex(LIGHT_ACCENT_SOFT_SURFACE), rgbFromHex(accentHex), 0.16))
}

function softHoverForAccent(accentHex: string): RgbColor {
  // CSS color-mix(in srgb, ...) keeps fractional channels for the hover surface.
  return mixColors(rgbFromHex(softForAccent(accentHex)), rgbFromHex(accentHex), 0.1)
}

function mixTowardBlack(source: RgbColor, amount: number): RgbColor {
  return {
    r: Math.round(source.r * (1 - amount)),
    g: Math.round(source.g * (1 - amount)),
    b: Math.round(source.b * (1 - amount)),
  }
}

function isReadableAccent(candidateHex: string): boolean {
  const candidate = rgbFromHex(candidateHex)
  const surfaces = LIGHT_ACCENT_SURFACES.map(rgbFromHex)
  if (surfaces.some((surface) => contrastRatio(candidate, surface) < TEXT_CONTRAST_TARGET)) {
    return false
  }

  const soft = rgbFromHex(softForAccent(candidateHex))
  const softHover = softHoverForAccent(candidateHex)
  if (
    [soft, softHover].some((surface) => contrastRatio(candidate, surface) < TEXT_CONTRAST_TARGET)
  ) {
    return false
  }

  return contrastRatio(rgbFromHex('#FFFFFF'), candidate) >= TEXT_CONTRAST_TARGET
}

function resolveDisplayColor(source: string): string {
  const sourceRgb = rgbFromHex(source)
  for (let step = 0; step <= 100; step += 1) {
    const candidate = toHex(mixTowardBlack(sourceRgb, step / 100))
    if (isReadableAccent(candidate)) return candidate
  }

  // Black satisfies the contrast requirements against all configured light surfaces.
  return '#000000'
}

export function resolveLightAccent(value: unknown): LightAccentResolution {
  const source = normalizeDarkAccent(value) ?? DEFAULT_LIGHT_ACCENT
  const display = resolveDisplayColor(source)
  return {
    source,
    display,
    soft: softForAccent(display),
    onAccent: '#FFFFFF',
    darkened: display !== source,
  }
}

export function getLightAccentContrastRatios(value: string): {
  surfaces: number[]
  softSurfaces: number[]
  whiteText: number
} {
  const accent = rgbFromHex(value)
  const softSurfaces = [rgbFromHex(softForAccent(value)), softHoverForAccent(value)]
  return {
    surfaces: LIGHT_ACCENT_SURFACES.map((surface) => contrastRatio(accent, rgbFromHex(surface))),
    softSurfaces: softSurfaces.map((surface) => contrastRatio(accent, surface)),
    whiteText: contrastRatio(rgbFromHex('#FFFFFF'), accent),
  }
}
