import { describe, expect, it } from 'vitest'
import type { ArtworkPalette, RgbColor } from '@renderer/features/playback/types'
import { rgbToOklab } from '@renderer/features/playback/utils/colorSpace'
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
    expect(resolveCdCanvasBackground(palette(gray, gray))).not.toBeNull()
    expect(resolveCdCanvasBackground({ ...palette(), quality: 'fallback' })).toBeNull()
  })
  it('keeps deep covers deep while muting saturated surfaces', () => {
    const dark = resolveCdCanvasBackground(palette({ r: 5, g: 8, b: 10 }, { r: 5, g: 8, b: 10 }))!
    expect(rgbToOklab(dark).l).toBeCloseTo(0.38, 2)
    const muted = rgbToOklab(resolveCdCanvasBackground(palette())!)
    expect(Math.hypot(muted.a, muted.b)).toBeLessThan(0.08)
  })
  it('retains already readable lyrics colors', () => {
    expect(readableCdColor({ r: 30, g: 30, b: 30 }, CD_LIGHT_BACKGROUND)).toEqual({
      r: 30,
      g: 30,
      b: 30,
    })
  })
  it('keeps every text token readable across colored and intermediate backgrounds', () => {
    const backgrounds = [gray, red, { r: 30, g: 50, b: 70 }, { r: 230, g: 220, b: 80 }]
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
