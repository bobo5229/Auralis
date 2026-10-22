import { describe, expect, it } from 'vitest'
import { getContrastRatio } from '@renderer/shared/color/colorMath'
import { rgbToOklab } from './colorSpace'
import { resolveFullscreenSolidColor } from './fullscreenSolidColor'

describe('solid fullscreen canvas adaptation', () => {
  it.each([
    { r: 255, g: 0, b: 0 },
    { r: 0, g: 255, b: 0 },
    { r: 0, g: 0, b: 255 },
    { r: 255, g: 255, b: 0 },
    { r: 0, g: 255, b: 255 },
    { r: 255, g: 0, b: 255 },
    { r: 0, g: 0, b: 0 },
    { r: 255, g: 255, b: 255 },
    { r: 128, g: 128, b: 128 },
  ])('keeps source %j in gamut with readable foregrounds and inactive lyrics', (source) => {
    const original = { ...source }
    const result = resolveFullscreenSolidColor(source)
    const lab = rgbToOklab(result.background)
    expect(lab.l).toBeCloseTo(0.34, 2)
    expect(Math.hypot(lab.a, lab.b)).toBeLessThan(0.078)
    expect(getContrastRatio(result.background, result.primary)).toBeGreaterThanOrEqual(4.5)
    expect(getContrastRatio(result.background, result.secondary)).toBeGreaterThanOrEqual(4.5)
    expect(getContrastRatio(result.background, result.control)).toBeGreaterThanOrEqual(3)
    const inactive = {
      r: Math.round(
        result.background.r + (result.primary.r - result.background.r) * result.inactiveOpacity,
      ),
      g: Math.round(
        result.background.g + (result.primary.g - result.background.g) * result.inactiveOpacity,
      ),
      b: Math.round(
        result.background.b + (result.primary.b - result.background.b) * result.inactiveOpacity,
      ),
    }
    expect(getContrastRatio(result.background, inactive)).toBeGreaterThanOrEqual(3)
    expect(source).toEqual(original)
    expect(resolveFullscreenSolidColor(source)).toEqual(result)
  })

  it('preserves the source hue while keeping grayscale and missing covers neutral', () => {
    for (const source of [
      { r: 180, g: 90, b: 100 },
      { r: 50, g: 170, b: 150 },
    ]) {
      const original = rgbToOklab(source)
      const adapted = rgbToOklab(resolveFullscreenSolidColor(source).background)
      const difference = Math.abs(
        Math.atan2(original.b, original.a) - Math.atan2(adapted.b, adapted.a),
      )
      expect(Math.min(difference, Math.PI * 2 - difference)).toBeLessThan(0.03)
    }
    const fallback = resolveFullscreenSolidColor(null)
    expect(fallback.background.r).toBe(fallback.background.g)
    expect(fallback.background.g).toBe(fallback.background.b)
    expect(resolveFullscreenSolidColor({ r: 255, g: 255, b: 255 }).background).toEqual(
      fallback.background,
    )
  })
})
