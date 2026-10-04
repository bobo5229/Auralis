import { hslToRgb, rgbToHsl } from '@renderer/shared/color/colorMath'

export type CdAccentRgb = { r: number; g: number; b: number }

/** Cover-derived stroke/lyric color. Light keeps the source; dark lifts dim hues. */
export function formatCdAccent(rgb: CdAccentRgb | null | undefined, dark: boolean): string {
  if (!rgb) return dark ? '#c5c8ce' : '#62625b'
  if (!dark) return `rgb(${Math.round(rgb.r)} ${Math.round(rgb.g)} ${Math.round(rgb.b)})`
  const { h, s: s0, l: l0 } = rgbToHsl(rgb)
  let s = s0
  let l = l0
  if (l < 0.5) l = Math.min(0.64, 0.52 + (0.5 - l) * 0.28)
  if (s > 0.72) s = 0.62
  const { r, g, b } = hslToRgb({ mode: 'hsl', h: h ?? 0, s, l })
  return `rgb(${r} ${g} ${b})`
}
