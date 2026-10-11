import { describe, expect, it } from 'vitest'
import { getContrastRatio } from '@renderer/shared/color/colorMath'
import {
  CD_DARK_BACKGROUND,
  CD_LIGHT_BACKGROUND,
  formatCdColor,
  readableCdColor,
} from './cdCanvasColors'

describe('CD lyrics color against the canvas', () => {
  it('retains already readable lyrics colors', () => {
    expect(readableCdColor({ r: 30, g: 30, b: 30 }, CD_LIGHT_BACKGROUND)).toEqual({
      r: 30,
      g: 30,
      b: 30,
    })
  })

  it('fits dim and saturated accents to the light and dark canvases', () => {
    for (const [source, background] of [
      [{ r: 20, g: 35, b: 140 }, CD_LIGHT_BACKGROUND],
      [{ r: 20, g: 35, b: 140 }, CD_DARK_BACKGROUND],
      [{ r: 230, g: 170, b: 190 }, CD_LIGHT_BACKGROUND],
      [{ r: 230, g: 170, b: 190 }, CD_DARK_BACKGROUND],
    ] as const) {
      const color = readableCdColor(source, background)
      expect(getContrastRatio(color, background)).toBeGreaterThanOrEqual(4.5)
      expect(formatCdColor(color)).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
    }
  })
})
