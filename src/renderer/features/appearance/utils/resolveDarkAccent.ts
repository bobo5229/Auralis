import type { RgbColor } from '@renderer/features/playback/types'
import { getRelativeLuminance } from '@renderer/features/playback/utils/resolvePlayerPrimaryButtonTextColor'
import { DEFAULT_DARK_ACCENT } from '../constants/darkAccent'

const DARK_ACCENT_SURFACES = ['#121212', '#1A1A1A', '#202020', '#262626'] as const
const DARK_ACCENT_TINT_STRENGTHS = [0.12, 0.16, 0.28] as const
const DARK_ACCENT_TEXT_TINT_STRENGTHS = [0.12, 0.16] as const
const TEXT_CONTRAST_TARGET = 4.5
const GRAPHIC_CONTRAST_TARGET = 3

export interface DarkAccentResolution {
  source: string
  display: string
  onAccent: string
  lightened: boolean
}

export function normalizeDarkAccent(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toUpperCase()
  return /^#[0-9A-F]{6}$/u.test(normalized) ? normalized : null
}

function rgbFromHex(hex: string): RgbColor {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  }
}

function contrastRatio(first: RgbColor, second: RgbColor): number {
  const firstLuminance = getRelativeLuminance(first)
  const secondLuminance = getRelativeLuminance(second)
  const lighter = Math.max(firstLuminance, secondLuminance)
  const darker = Math.min(firstLuminance, secondLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

function mixAccentOverSurface(accent: RgbColor, surface: RgbColor, strength: number): RgbColor {
  return {
    r: Math.round(accent.r * strength + surface.r * (1 - strength)),
    g: Math.round(accent.g * strength + surface.g * (1 - strength)),
    b: Math.round(accent.b * strength + surface.b * (1 - strength)),
  }
}

function mixTowardWhite(source: RgbColor, amount: number): RgbColor {
  return {
    r: Math.round(source.r + (255 - source.r) * amount),
    g: Math.round(source.g + (255 - source.g) * amount),
    b: Math.round(source.b + (255 - source.b) * amount),
  }
}

function toHex(color: RgbColor): string {
  const channel = (value: number): string => Math.round(value).toString(16).padStart(2, '0')
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`.toUpperCase()
}

function isReadableAccent(candidate: RgbColor): boolean {
  const surfaces = DARK_ACCENT_SURFACES.map(rgbFromHex)
  if (surfaces.some((surface) => contrastRatio(candidate, surface) < TEXT_CONTRAST_TARGET)) {
    return false
  }

  for (const strength of DARK_ACCENT_TINT_STRENGTHS) {
    for (const surface of surfaces) {
      const composite = mixAccentOverSurface(candidate, surface, strength)
      const target = strength <= 0.16 ? TEXT_CONTRAST_TARGET : GRAPHIC_CONTRAST_TARGET
      if (contrastRatio(candidate, composite) < target) return false
    }
  }
  return true
}

function resolveDisplayColor(source: string): { color: string; lightened: boolean } {
  const sourceRgb = rgbFromHex(source)
  for (let step = 0; step <= 100; step += 1) {
    const candidate = mixTowardWhite(sourceRgb, step / 100)
    if (isReadableAccent(candidate)) {
      const color = toHex(candidate)
      return { color, lightened: color !== source }
    }
  }

  return { color: '#FFFFFF', lightened: source !== '#FFFFFF' }
}

function resolveOnAccentColor(color: string): string {
  const accent = rgbFromHex(color)
  const dark = rgbFromHex('#121212')
  const light = rgbFromHex('#FFFFFF')
  return contrastRatio(dark, accent) >= contrastRatio(light, accent) ? '#121212' : '#FFFFFF'
}

export function resolveDarkAccent(value: unknown): DarkAccentResolution {
  const source = normalizeDarkAccent(value) ?? DEFAULT_DARK_ACCENT
  const display = resolveDisplayColor(source)
  return {
    source,
    display: display.color,
    onAccent: resolveOnAccentColor(display.color),
    lightened: display.lightened,
  }
}

export function getDarkAccentContrastRatios(value: string): {
  surfaces: number[]
  tintedSurfaces: number[]
  textTintedSurfaces: number[]
} {
  const accent = rgbFromHex(value)
  const surfaces = DARK_ACCENT_SURFACES.map(rgbFromHex)
  return {
    surfaces: surfaces.map((surface) => contrastRatio(accent, surface)),
    tintedSurfaces: DARK_ACCENT_TINT_STRENGTHS.flatMap((strength) =>
      surfaces.map((surface) =>
        contrastRatio(accent, mixAccentOverSurface(accent, surface, strength)),
      ),
    ),
    textTintedSurfaces: DARK_ACCENT_TEXT_TINT_STRENGTHS.flatMap((strength) =>
      surfaces.map((surface) =>
        contrastRatio(accent, mixAccentOverSurface(accent, surface, strength)),
      ),
    ),
  }
}
