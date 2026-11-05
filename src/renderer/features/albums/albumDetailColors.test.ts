import { describe, expect, it } from 'vitest'
import { getContrastRatio, getRelativeLuminance } from '@renderer/shared/color/colorMath'
import { albumDetailColors, readableAlbumText } from './albumDetailColors'

describe('album detail colors', () => {
  it('keeps a light green source coordinated and readable', () => {
    const colors = albumDetailColors({ r: 207, g: 255, b: 196 })
    expect(colors.main.g).toBeGreaterThan(colors.main.r)
    expect(colors.main.g).toBeGreaterThan(colors.main.b)
    expect(getRelativeLuminance(colors.side)).toBeLessThan(getRelativeLuminance(colors.main))
    expect(getContrastRatio(colors.mainText, colors.main)).toBeGreaterThanOrEqual(4.5)
    expect(getContrastRatio(colors.lyricsActive, colors.side)).toBeGreaterThanOrEqual(4.5)
    expect(getContrastRatio(colors.lyricsInactive, colors.side)).toBeGreaterThanOrEqual(4.5)
    expect(colors.divider).toEqual(colors.mainText)
  })
  it('keeps a dark neutral source neutral and readable', () => {
    const colors = albumDetailColors({ r: 36, g: 36, b: 36 })
    expect(colors.main.r).toBe(colors.main.g)
    expect(colors.main.g).toBe(colors.main.b)
    expect(getRelativeLuminance(colors.side)).toBeLessThan(getRelativeLuminance(colors.main))
    expect(getContrastRatio(colors.lyricsActive, colors.side)).toBeGreaterThanOrEqual(4.5)
  })
  it('keeps a black source near black on the main panel while preserving the side surfaces', () => {
    const colors = albumDetailColors({ r: 0, g: 0, b: 0 })
    expect(colors.main).toEqual({ r: 18, g: 18, b: 18 })
    expect(colors.more).toEqual({ r: 41, g: 41, b: 41 })
    expect(colors.side).toEqual({ r: 31, g: 31, b: 31 })
    expect(getContrastRatio(colors.mainText, colors.main)).toBeGreaterThanOrEqual(4.5)
    expect(getContrastRatio(colors.mainMuted, colors.main)).toBeGreaterThanOrEqual(4.5)
  })
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
      { r: 120, g: 212, b: 205 },
      { r: 240, g: 20, b: 35 },
      { r: 30, g: 100, b: 220 },
      { r: 255, g: 230, b: 0 },
      { r: 0, g: 220, b: 100 },
      { r: 130, g: 130, b: 130 },
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
    ]) {
      const c = albumDetailColors(source)
      expect(c.divider).toEqual(c.mainText)
      expect(getContrastRatio(c.divider, c.main)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(c.lyricsActive, c.side)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(c.lyricsInactive, c.side)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(c.lyricsMuted, c.side)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(c.mainText, c.main)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(c.mainMuted, c.main)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(c.mainFaint, c.main)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(c.sideText, c.side)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(c.sideMuted, c.side)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(c.sideFaint, c.side)).toBeGreaterThanOrEqual(4.5)
      if (getRelativeLuminance(source) > 0.01)
        expect(getRelativeLuminance(c.main)).toBeGreaterThan(getRelativeLuminance(c.more))
      expect(getRelativeLuminance(c.more)).toBeGreaterThan(getRelativeLuminance(c.side))
      expect(getRelativeLuminance(c.side)).toBeGreaterThan(getRelativeLuminance(c.accent))
      expect(getContrastRatio(c.accentText, c.accent)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(c.accentBorder, c.main)).toBeGreaterThanOrEqual(1.5)
      expect(getContrastRatio(c.accentSideBorder, c.side)).toBeGreaterThanOrEqual(1.5)
      expect(getContrastRatio(c.moreText, c.more)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(c.moreFaint, c.more)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
