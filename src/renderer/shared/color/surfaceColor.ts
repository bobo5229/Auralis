import { oklabToRgb } from './colorMath'
import type { OklabColor, RgbColor } from './types'

export interface SurfaceColor extends RgbColor {
  a: number
  lab?: OklabColor
}
export function parseSurfaceColor(value: string): SurfaceColor | null {
  const raw = value.trim()
  const lab = /^oklab\(\s*([-+\d.]+)\s+([-+\d.]+)\s+([-+\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/i.exec(
    raw,
  )
  if (lab) {
    const value = { l: Number(lab[1]), a: Number(lab[2]), b: Number(lab[3]) }
    return { ...oklabToRgb(value), a: lab[4] === undefined ? 1 : Number(lab[4]), lab: value }
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw)?.[1]
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
    return {
      r: parseInt(full.slice(0, 2), 16),
      g: parseInt(full.slice(2, 4), 16),
      b: parseInt(full.slice(4, 6), 16),
      a: 1,
    }
  }
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i.exec(
    raw,
  )
  return rgb
    ? {
        r: Number(rgb[1]),
        g: Number(rgb[2]),
        b: Number(rgb[3]),
        a: rgb[4] === undefined ? 1 : Number(rgb[4]),
      }
    : null
}
