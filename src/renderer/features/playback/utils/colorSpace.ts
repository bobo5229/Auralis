import type { OklabColor, RgbColor } from '../types'

function srgbChannelToLinear(value: number): number {
  const channel = value / 255
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
}

function linearChannelToSrgb(value: number): number {
  const channel = value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, channel)) * 255)
}

export function rgbToOklab(color: RgbColor): OklabColor {
  const r = srgbChannelToLinear(color.r)
  const g = srgbChannelToLinear(color.g)
  const b = srgbChannelToLinear(color.b)

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

export function oklabToRgb(color: OklabColor): RgbColor {
  const l = color.l + 0.3963377774 * color.a + 0.2158037573 * color.b
  const m = color.l - 0.1055613458 * color.a - 0.0638541728 * color.b
  const s = color.l - 0.0894841775 * color.a - 1.291485548 * color.b

  const l3 = l * l * l
  const m3 = m * m * m
  const s3 = s * s * s

  return {
    r: linearChannelToSrgb(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
    g: linearChannelToSrgb(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
    b: linearChannelToSrgb(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3),
  }
}

export function getOklabDistance(a: OklabColor, b: OklabColor): number {
  return Math.sqrt((a.l - b.l) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2)
}

export function getOklabChroma(color: OklabColor): number {
  return Math.sqrt(color.a * color.a + color.b * color.b)
}

export function mixRgb(from: RgbColor, to: RgbColor, progress: number): RgbColor {
  return {
    r: from.r + (to.r - from.r) * progress,
    g: from.g + (to.g - from.g) * progress,
    b: from.b + (to.b - from.b) * progress,
  }
}
