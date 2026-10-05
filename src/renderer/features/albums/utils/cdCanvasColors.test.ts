import { describe, expect, it } from 'vitest'
import type { ArtworkPalette, RgbColor } from '@renderer/features/playback/types'
import { rgbToOklab } from '@renderer/features/playback/utils/colorSpace'
import { extractArtworkPalette } from '@renderer/features/playback/utils/extractArtworkPalette'
import {
  CD_LIGHT_BACKGROUND,
  cdCanvasColorTokens,
  cdColorContrast,
  mixCdColor,
  readableCdColor,
  resolveCdCanvasBackground,
} from './cdCanvasColors'

const red: RgbColor = { r: 230, g: 30, b: 80 }
const gray: RgbColor = { r: 160, g: 160, b: 160 }
function palette(dominant = gray, accent = red): ArtworkPalette {
  return {
    key: 'cover',
    dominant,
    background: gray,
    textTone: 'light',
    quality: 'full',
    accents: [
      {
        rgb: accent,
        oklab: rgbToOklab(accent),
        weight: 0.2,
        chroma: Math.hypot(rgbToOklab(accent).a, rgbToOklab(accent).b),
      },
    ],
  }
}
function parseRgb(value: string): RgbColor {
  const [r, g, b] = value.match(/\d+/g)!.map(Number)
  return { r: r!, g: g!, b: b! }
}
describe('CD canvas cover colors', () => {
  it('uses the chromatic accent, with a monochrome fallback and no failed-cover tint', () => {
    expect(resolveCdCanvasBackground(palette(gray, red))).toEqual(
      resolveCdCanvasBackground(palette({ r: 10, g: 10, b: 10 }, red)),
    )
    const monochrome = resolveCdCanvasBackground(palette(gray, gray))!
    expect(monochrome).not.toBeNull()
    expect(monochrome.r).toBe(monochrome.g)
    expect(monochrome.g).toBe(monochrome.b)
    expect(resolveCdCanvasBackground({ ...palette(), quality: 'fallback' })).toBeNull()
  })
  it('lifts deep covers and retains color on saturated surfaces', () => {
    const dark = resolveCdCanvasBackground(palette({ r: 5, g: 8, b: 10 }, { r: 5, g: 8, b: 10 }))!
    expect(rgbToOklab(dark).l).toBeCloseTo(0.67, 2)
    const saturated = rgbToOklab(resolveCdCanvasBackground(palette())!)
    expect(Math.hypot(saturated.a, saturated.b)).toBeGreaterThan(0.16)
    expect(Math.hypot(saturated.a, saturated.b)).toBeLessThan(0.215)
  })
  it('uses the original green accent instead of the darker display accent or black lettering', () => {
    const green = { r: 138, g: 206, b: 0 }
    const pixels = new Uint8ClampedArray([
      ...Array.from({ length: 90 }, () => [green.r, green.g, green.b, 255]).flat(),
      ...Array.from({ length: 10 }, () => [0, 0, 0, 255]).flat(),
    ])
    const extracted = extractArtworkPalette('green-with-black-lettering', pixels)
    expect(extracted.accents[0]!.sourceRgb).toEqual(green)
    const canvas = rgbToOklab(resolveCdCanvasBackground(extracted)!)
    const source = rgbToOklab(green)
    expect(canvas.l).toBeCloseTo(source.l - 0.05, 2)
    expect(canvas.l).toBeGreaterThan(extracted.accents[0]!.oklab.l + 0.05)
    // The deeper background needs slight chroma reduction to remain in sRGB.
    expect(Math.hypot(canvas.a, canvas.b)).toBeGreaterThan(0.18)
    expect(Math.atan2(canvas.b, canvas.a)).toBeCloseTo(Math.atan2(source.b, source.a), 1)
  })
  it('preserves the hue of pink and deep blue covers when lifting them into the canvas gamut', () => {
    for (const rgb of [
      { r: 230, g: 170, b: 190 },
      { r: 20, g: 35, b: 140 },
    ]) {
      const result = rgbToOklab(resolveCdCanvasBackground(palette(gray, rgb))!)
      const source = rgbToOklab(rgb)
      expect(result.l).toBeGreaterThanOrEqual(0.665)
      expect(Math.atan2(result.b, result.a)).toBeCloseTo(Math.atan2(source.b, source.a), 1)
    }
  })
  it('gently deepens bright and neutral covers without shifting their hue', () => {
    for (const rgb of [
      { r: 250, g: 220, b: 180 },
      { r: 230, g: 170, b: 190 },
      gray,
      { r: 255, g: 255, b: 255 },
    ]) {
      const source = rgbToOklab(rgb)
      const result = rgbToOklab(resolveCdCanvasBackground(palette(rgb, rgb))!)
      expect(result.l).toBeCloseTo(Math.max(0.72, Math.min(0.88, source.l)) - 0.05, 2)
      expect(result.l).toBeLessThan(source.l - 0.03)
      if (Math.hypot(source.a, source.b) > 0.035) {
        expect(Math.atan2(result.b, result.a)).toBeCloseTo(Math.atan2(source.b, source.a), 1)
      }
    }
  })
  it('retains already readable lyrics colors', () => {
    expect(readableCdColor({ r: 30, g: 30, b: 30 }, CD_LIGHT_BACKGROUND)).toEqual({
      r: 30,
      g: 30,
      b: 30,
    })
  })
  it('keeps every text token readable across colored and intermediate backgrounds', () => {
    const backgrounds = [
      gray,
      red,
      { r: 30, g: 50, b: 70 },
      { r: 230, g: 220, b: 80 },
      ...[red, { r: 138, g: 206, b: 0 }, { r: 230, g: 170, b: 190 }, { r: 20, g: 35, b: 140 }].map(
        (color) => resolveCdCanvasBackground(palette(gray, color))!,
      ),
    ]
    for (const end of backgrounds)
      for (let frame = 0; frame <= 20; frame++) {
        const background = mixCdColor(CD_LIGHT_BACKGROUND, end, frame / 20)
        const tokens = cdCanvasColorTokens(background, red)
        expect(
          cdColorContrast(parseRgb(tokens['--cd-info-title-border']!), background),
        ).toBeGreaterThanOrEqual(4.5)
        for (const [name, value] of Object.entries(tokens)) {
          if (
            name.startsWith('--cd-text') ||
            name === '--cd-lyrics-color' ||
            name === '--cd-wave-accent' ||
            name === '--cd-error'
          ) {
            expect(
              cdColorContrast(parseRgb(value), background),
              `${name} at frame ${frame}`,
            ).toBeGreaterThanOrEqual(4.5)
            expect(
              cdColorContrast(parseRgb(value), parseRgb(tokens['--cd-hover-bg']!)),
            ).toBeGreaterThanOrEqual(4.5)
          }
        }
      }
  })
})
