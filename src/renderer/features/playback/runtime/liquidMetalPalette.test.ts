import { describe, expect, it } from 'vitest'
import { rgbToOklab } from '../utils/colorSpace'
import { FALLBACK_PALETTE } from '../utils/artworkPaletteDefaults'
import { toLiquidMetalPalette } from './liquidMetalPalette'
import type { ArtworkPalette, PaletteColor, RgbColor } from '../types'

function accent(rgb: RgbColor, weight: number, sourceRgb?: RgbColor): PaletteColor {
  return { rgb, sourceRgb, weight, oklab: rgbToOklab(rgb), chroma: 0 }
}

describe('liquid-metal album color mapping', () => {
  it('uses original album colors rather than the darkened UI accent', () => {
    const palette: ArtworkPalette = {
      ...FALLBACK_PALETTE,
      quality: 'reduced',
      accents: [accent({ r: 20, g: 20, b: 20 }, 1, { r: 255, g: 255, b: 0 })],
    }
    const result = toLiquidMetalPalette(palette)
    expect(Array.from(result.colors.slice(0, 3))).toEqual([1, 1, 0])
  })

  it('sorts by coverage and normalizes meaningful colors without allocating unused weights', () => {
    const result = toLiquidMetalPalette({
      ...FALLBACK_PALETTE,
      quality: 'reduced',
      accents: [accent({ r: 255, g: 0, b: 0 }, 0.1), accent({ r: 0, g: 0, b: 255 }, 0.3)],
    })
    expect(Array.from(result.colors.slice(0, 6))).toEqual([0, 0, 1, 1, 0, 0])
    expect(Array.from(result.weights)).toEqual([0.75, 0.25, 0, 0, 0, 0])
  })

  it('keeps the no-artwork fallback neutral and finite', () => {
    const result = toLiquidMetalPalette(FALLBACK_PALETTE)
    expect(result.weights[0]).toBe(1)
    expect(Array.from(result.colors).every(Number.isFinite)).toBe(true)
    expect(
      Math.max(...result.colors.slice(0, 3)) - Math.min(...result.colors.slice(0, 3)),
    ).toBeLessThan(0.03)
  })
})
