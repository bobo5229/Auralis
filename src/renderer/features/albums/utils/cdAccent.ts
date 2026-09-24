export type CdAccentRgb = { r: number; g: number; b: number }

function hslFromRgb(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (!d) return [0, 0, l]
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h / 6, s, l]
}

function rgbFromHsl(h: number, s: number, l: number): [number, number, number] {
  const hue = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  if (!s) {
    const gray = Math.round(l * 255)
    return [gray, gray, gray]
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [h + 1 / 3, h, h - 1 / 3].map((channel) => Math.round(hue(p, q, channel) * 255)) as [
    number,
    number,
    number,
  ]
}

/** Cover-derived stroke/lyric color. Light keeps the source; dark lifts dim hues. */
export function formatCdAccent(rgb: CdAccentRgb | null | undefined, dark: boolean): string {
  if (!rgb) return dark ? '#c5c8ce' : '#62625b'
  if (!dark) return `rgb(${Math.round(rgb.r)} ${Math.round(rgb.g)} ${Math.round(rgb.b)})`
  const [h, s0, l0] = hslFromRgb(rgb.r, rgb.g, rgb.b)
  let s = s0
  let l = l0
  if (l < 0.5) l = Math.min(0.64, 0.52 + (0.5 - l) * 0.28)
  if (s > 0.72) s = 0.62
  const [r, g, b] = rgbFromHsl(h, s, l)
  return `rgb(${r} ${g} ${b})`
}
