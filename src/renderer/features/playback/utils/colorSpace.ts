import type { OklabColor } from '../types'

export { rgbToOklab, oklabToRgb } from '@renderer/shared/color/colorMath'

export function getOklabDistance(a: OklabColor, b: OklabColor): number {
  return Math.sqrt((a.l - b.l) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2)
}

export function getOklabChroma(color: OklabColor): number {
  return Math.sqrt(color.a * color.a + color.b * color.b)
}
