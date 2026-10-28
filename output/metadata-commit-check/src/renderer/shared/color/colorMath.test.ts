import { describe, expect, it } from 'vitest'
import {
  getContrastRatio,
  getRelativeLuminance,
  hslToRgb,
  oklabToRgb,
  rgbToHsl,
  rgbToOklab,
} from './colorMath'

const black = { r: 0, g: 0, b: 0 }
const white = { r: 255, g: 255, b: 255 }

describe('colorMath', () => {
  it.each([
    [black, { l: 0, a: 0, b: 0 }],
    [white, { l: 1, a: 0, b: 0 }],
    [
      { r: 255, g: 0, b: 0 },
      { l: 0.62795536, a: 0.22486306, b: 0.1258463 },
    ],
    [
      { r: 0, g: 255, b: 0 },
      { l: 0.86643961, a: -0.23388757, b: 0.17949848 },
    ],
    [
      { r: 0, g: 0, b: 255 },
      { l: 0.45201372, a: -0.03245698, b: -0.31152815 },
    ],
  ])('converts byte RGB %j to the expected Oklab coordinates', (rgb, expected) => {
    const lab = rgbToOklab(rgb)
    expect(lab.l).toBeCloseTo(expected.l, 6)
    expect(lab.a).toBeCloseTo(expected.a, 6)
    expect(lab.b).toBeCloseTo(expected.b, 6)
  })

  it.each([black, white, { r: 28, g: 46, b: 88 }, { r: 244, g: 114, b: 182 }])(
    'round-trips integer RGB %j without changing its channels or adding a mode',
    (rgb) => {
      expect(oklabToRgb(rgbToOklab(rgb))).toEqual(rgb)
    },
  )

  it('clips out-of-gamut Oklab channels and rounds back to integer RGB', () => {
    const rgb = oklabToRgb({ l: 0.7, a: 0.5, b: -0.5 })
    expect(rgb).toEqual({ r: 255, g: 0, b: 255 })
    expect(oklabToRgb({ l: -0.1, a: 0, b: 0 })).toEqual(black)
    expect(oklabToRgb({ l: 1.1, a: 0, b: 0 })).toEqual(white)
  })

  it.each([
    [{ r: 255, g: 0, b: 0 }, 0],
    [{ r: 0, g: 255, b: 0 }, 120],
    [{ r: 0, g: 0, b: 255 }, 240],
  ])('uses degrees for HSL hue with byte RGB %j', (rgb, hue) => {
    const hsl = rgbToHsl(rgb)
    expect(hsl).toEqual({ mode: 'hsl', h: hue, s: 1, l: 0.5 })
    expect(hslToRgb(hsl)).toEqual(rgb)
  })

  it('handles achromatic HSL and wrapped hue without introducing color', () => {
    const gray = { r: 128, g: 128, b: 128 }
    const hsl = rgbToHsl(gray)
    expect(hsl.s).toBe(0)
    expect(hslToRgb(hsl)).toEqual(gray)
    expect(hslToRgb({ mode: 'hsl', h: 360, s: 1, l: 0.5 })).toEqual({
      r: 255,
      g: 0,
      b: 0,
    })
  })

  it('calculates WCAG luminance and symmetric contrast using the existing scale', () => {
    expect(getRelativeLuminance(black)).toBe(0)
    expect(getRelativeLuminance(white)).toBe(1)
    expect(getRelativeLuminance({ r: 255, g: 0, b: 0 })).toBeCloseTo(0.2126, 12)
    expect(getRelativeLuminance({ r: 128, g: 128, b: 128 })).toBeCloseTo(0.2158605, 6)
    expect(getContrastRatio(black, white)).toBe(21)
    expect(getContrastRatio(white, black)).toBe(21)
    expect(getContrastRatio(white, white)).toBe(1)
  })

  it('preserves luminance sanitization for non-finite and out-of-range channels', () => {
    expect(getRelativeLuminance({ r: NaN, g: Infinity, b: -Infinity })).toBe(0)
    expect(getRelativeLuminance({ r: -20, g: 300, b: 0 })).toBeCloseTo(0.7152, 12)
    expect(getContrastRatio({ r: NaN, g: 0, b: 0 }, white)).toBe(21)
  })
})
