import { describe, expect, it } from 'vitest'
import { getContrastRatio, getRelativeLuminance } from '@renderer/shared/color/colorMath'
import { albumDetailColors, readableAlbumText } from './albumDetailColors'

describe('album detail colors', () => {
  it('matches the approved vibrant prototype for a red cover', () => {
    const colors = albumDetailColors({ r: 235, g: 30, b: 30 })
    expect(colors.main).toEqual({ r: 192, g: 69, b: 59 })
    expect(colors.side).toEqual({ r: 138, g: 5, b: 9 })
  })
  it('preserves readable theme text and adjusts only colors that need contrast', () => {
    const background = { r: 30, g: 30, b: 30 }
    const readable = { r: 220, g: 220, b: 220 }
    expect(readableAlbumText(readable, background)).toEqual(readable)
    expect(
      getContrastRatio(readableAlbumText({ r: 70, g: 70, b: 70 }, background), background),
    ).toBeGreaterThanOrEqual(4.5)
  })
  it('keeps text readable on the shared dark surfaces', () => {
    for (const source of [
      { r: 240, g: 20, b: 35 },
      { r: 30, g: 100, b: 220 },
      { r: 255, g: 230, b: 0 },
      { r: 0, g: 220, b: 100 },
      { r: 130, g: 130, b: 130 },
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
    ]) {
      const c = albumDetailColors(source)
      expect(c.divider.r).toBe(c.divider.g)
      expect(c.divider.g).toBe(c.divider.b)
      expect(getContrastRatio(c.divider, c.main)).toBeGreaterThanOrEqual(1.7)
      expect(getContrastRatio(c.lyricsActive, c.side)).toBeGreaterThanOrEqual(4.5)
      const blended = Object.fromEntries(
        (['r', 'g', 'b'] as const).map((channel) => [
          channel,
          Math.round(c.side[channel] * 0.2 + c.lyricsInactive[channel] * 0.8),
        ]),
      ) as typeof c.side
      expect(getContrastRatio(blended, c.side)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(c.lyricsMuted, c.side)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(c.mainText, c.main)).toBeGreaterThanOrEqual(4.5)
      expect(getRelativeLuminance(c.main)).toBeGreaterThan(getRelativeLuminance(c.more))
      expect(getRelativeLuminance(c.more)).toBeGreaterThan(getRelativeLuminance(c.side))
      expect(getContrastRatio(c.moreText, c.more)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(c.moreFaint, c.more)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
