import { describe, expect, it } from 'vitest'
import {
  calculateCentrifugalRadius,
  calculateOrbitOffset,
  calculateSpacingExpand,
  calculateStaggerOpacities,
  pickLyricsExitAnimation,
  LYRICS_EXIT_ANIMATIONS,
  type LyricsExitAnimation,
} from './cdLyricsExitAnimation'

describe('CD lyrics exit animation helpers', () => {
  it('picks without immediate repetition when possible', () => {
    let last: LyricsExitAnimation | null = null
    for (let index = 0; index < 20; index++) {
      const next = pickLyricsExitAnimation(last)
      expect(LYRICS_EXIT_ANIMATIONS).toContain(next)
      if (last !== null) {
        expect(next).not.toBe(last)
      }
      last = next
    }
  })

  it('calculates staggered glyph opacities with forward progression', () => {
    // Zero progress: all glyphs fully opaque
    const initial = calculateStaggerOpacities(5, 0)
    expect(initial).toEqual([1, 1, 1, 1, 1])

    // Mid progress: earlier glyphs fade before later glyphs
    const mid = calculateStaggerOpacities(5, 0.4)
    expect(mid[0]).toBeLessThan(mid[1])
    expect(mid[1]).toBeLessThan(mid[2])
    expect(mid[2]).toBeLessThan(mid[3])
    expect(mid[3]).toBeLessThan(mid[4])

    // Full progress: all glyphs fully faded
    const final = calculateStaggerOpacities(5, 1)
    expect(final).toEqual([0, 0, 0, 0, 0])

    // Edge cases: 0 or 1 glyph
    expect(calculateStaggerOpacities(0, 0.5)).toEqual([])
    expect(calculateStaggerOpacities(1, 0.5)).toEqual([0.5])
  })

  it('calculates orbit offset correctly for positive and negative drift', () => {
    expect(calculateOrbitOffset(1, 0)).toBe('50.00%')
    expect(calculateOrbitOffset(-1, 0)).toBe('50.00%')

    expect(calculateOrbitOffset(1, 1, 4)).toBe('54.00%')
    expect(calculateOrbitOffset(-1, 1, 4)).toBe('46.00%')
  })

  it('calculates spacing expansion respecting font size and spread bounds', () => {
    expect(calculateSpacingExpand(24, 0)).toBe(0)
    const expanded = calculateSpacingExpand(24, 1, 4)
    expect(expanded).toBe(4) // 24 * 0.18 = 4.32, clamped to 4
  })

  it('calculates centrifugal radius correctly', () => {
    expect(calculateCentrifugalRadius(0)).toBe(0)
    expect(calculateCentrifugalRadius(1, 8)).toBe(8)
    expect(calculateCentrifugalRadius(0.5, 8)).toBe(6) // 1 - (1 - 0.5)^2 = 0.75; 8 * 0.75 = 6
  })
})
