import { describe, expect, it } from 'vitest'
import { DEFAULT_LIGHT_ACCENT, DEFAULT_LIGHT_ACCENT_SOFT } from '../constants/lightAccent'
import { getContrastRatio } from '@renderer/shared/color/colorMath'
import { getLightAccentContrastRatios, resolveLightAccent } from './resolveLightAccent'

describe('light accent color rules', () => {
  it('preserves the current default light appearance', () => {
    expect(resolveLightAccent(DEFAULT_LIGHT_ACCENT)).toEqual({
      source: DEFAULT_LIGHT_ACCENT,
      display: DEFAULT_LIGHT_ACCENT,
      soft: DEFAULT_LIGHT_ACCENT_SOFT,
      onAccent: '#FFFFFF',
      darkened: false,
    })
  })

  it('keeps default hover text above the 4.5 contrast target with the 90/10 mix', () => {
    const ratios = getLightAccentContrastRatios(DEFAULT_LIGHT_ACCENT)
    expect(ratios.softSurfaces[1]).toBeGreaterThanOrEqual(4.5)
    expect(ratios.softSurfaces[1]).toBeCloseTo(4.61, 2)
  })

  it('normalizes valid input and falls back to the default for invalid input', () => {
    expect(resolveLightAccent('  #aBcD09  ').source).toBe('#ABCD09')
    expect(resolveLightAccent('#ABC').source).toBe(DEFAULT_LIGHT_ACCENT)
    expect(resolveLightAccent('#ABCDEF80').source).toBe(DEFAULT_LIGHT_ACCENT)
    expect(resolveLightAccent('rgb(1, 2, 3)').source).toBe(DEFAULT_LIGHT_ACCENT)
  })

  it.each(['#09AAB0', '#08755A', '#04D558'])(
    'keeps %s readable on the fractional sRGB hover mix used by CSS',
    (source) => {
      const result = resolveLightAccent(source)
      const rgb = (hex: string) => ({
        r: Number.parseInt(hex.slice(1, 3), 16),
        g: Number.parseInt(hex.slice(3, 5), 16),
        b: Number.parseInt(hex.slice(5, 7), 16),
      })
      const accent = rgb(result.display)
      const soft = rgb(result.soft)
      const hover = {
        r: soft.r * 0.9 + accent.r * 0.1,
        g: soft.g * 0.9 + accent.g * 0.1,
        b: soft.b * 0.9 + accent.b * 0.1,
      }

      expect(result.source).toBe(source)
      expect(getContrastRatio(accent, hover)).toBeGreaterThanOrEqual(4.5)
    },
  )

  it('keeps the first readable shade and validates text on every light surface', () => {
    for (const source of [
      DEFAULT_LIGHT_ACCENT,
      '#FFFFFF',
      '#000000',
      '#FF0000',
      '#00FF00',
      '#0000FF',
      '#FFFF80',
    ]) {
      const result = resolveLightAccent(source)
      const ratios = getLightAccentContrastRatios(result.display)

      expect(
        ratios.surfaces.every((ratio) => ratio >= 4.5),
        `${source} base surfaces`,
      ).toBe(true)
      expect(
        ratios.softSurfaces.every((ratio) => ratio >= 4.5),
        `${source} soft surfaces`,
      ).toBe(true)
      expect(ratios.whiteText, `${source} white button text`).toBeGreaterThanOrEqual(4.5)
      expect(result.onAccent).toBe('#FFFFFF')
      expect(result.darkened).toBe(result.display !== result.source)
    }
  })

  it('darkens white and keeps black unchanged when both already meet the thresholds', () => {
    expect(resolveLightAccent('#FFFFFF').darkened).toBe(true)
    expect(resolveLightAccent('#000000')).toMatchObject({
      source: '#000000',
      display: '#000000',
      darkened: false,
    })
  })
})
