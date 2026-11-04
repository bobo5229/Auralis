import { describe, expect, it } from 'vitest'
import { getContrastRatio, getRelativeLuminance } from '@renderer/shared/color/colorMath'
import { albumDetailColors, readableAlbumText } from './albumDetailColors'

describe('album detail colors', () => {
  it('retains the approved gentle surfaces for a light pink cover', () => {
    const colors = albumDetailColors({ r: 246, g: 213, b: 213 })
    expect(colors.main).toEqual({ r: 246, g: 213, b: 213 })
    expect(colors.side).toEqual({ r: 219, g: 187, b: 187 })
    expect(colors.mainText.r).toBeLessThan(100)
    expect(colors.lyricsActive.r).toBeLessThan(colors.lyricsInactive.r)
  })
  it('preserves readable theme text and adjusts only colors that need contrast', () => {
    const background = { r: 30, g: 30, b: 30 }
    const readable = { r: 220, g: 220, b: 220 }
    expect(readableAlbumText(readable, background)).toEqual(readable)
    expect(
      getContrastRatio(readableAlbumText({ r: 70, g: 70, b: 70 }, background), background),
    ).toBeGreaterThanOrEqual(4.5)
  })
  it('keeps text readable on cover-derived light and dark surfaces', () => {
    for (const source of [
      { r: 246, g: 213, b: 213 },
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
      expect(getContrastRatio(c.lyricsInactive, c.side)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(c.lyricsMuted, c.side)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(c.mainText, c.main)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(c.mainMuted, c.main)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(c.mainFaint, c.main)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(c.sideText, c.side)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(c.sideMuted, c.side)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(c.sideFaint, c.side)).toBeGreaterThanOrEqual(4.5)
      expect(getRelativeLuminance(c.main)).toBeGreaterThan(getRelativeLuminance(c.more))
      expect(getRelativeLuminance(c.more)).toBeGreaterThan(getRelativeLuminance(c.side))
      expect(getContrastRatio(c.moreText, c.more)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(c.moreFaint, c.more)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
