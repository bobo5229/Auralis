import { describe, expect, it } from 'vitest'
import { getRelativeLuminance } from './resolvePlayerPrimaryButtonTextColor'
import { PLAYBAR_SURFACE_BOUND, resolvePlaybarAccent } from './resolvePlaybarAccent'

describe('resolvePlaybarAccent', () => {
  it('keeps the scoped neutral text above 4.5:1 on the surface bound', () => {
    // main.css: --auralis-text-muted / --auralis-text-faint inside .player-bar.
    const secondaryText = { r: 225, g: 221, b: 214 }
    expect(
      (getRelativeLuminance(secondaryText) + 0.05) /
        (getRelativeLuminance(PLAYBAR_SURFACE_BOUND) + 0.05),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps functional graphics readable across dark, neutral and saturated artwork', () => {
    for (const r of [0, 32, 128, 255]) {
      for (const g of [0, 32, 128, 255]) {
        for (const b of [0, 32, 128, 255]) {
          const accent = resolvePlaybarAccent({ r, g, b })
          const contrast =
            (getRelativeLuminance(accent) + 0.05) /
            (getRelativeLuminance(PLAYBAR_SURFACE_BOUND) + 0.05)
          expect(contrast).toBeGreaterThanOrEqual(3)
        }
      }
    }
  })

  it('preserves already readable colors and does not mutate the palette', () => {
    const source = { r: 234, g: 218, b: 178 }
    expect(resolvePlaybarAccent(source)).toEqual(source)
    expect(resolvePlaybarAccent(source)).not.toBe(source)
  })

  it('uses the unified accent fallback for absent or invalid artwork', () => {
    const fallback = resolvePlaybarAccent()
    expect(fallback).toEqual({ r: 143, g: 167, b: 187 })
    expect(resolvePlaybarAccent(null)).toEqual(fallback)
    expect(resolvePlaybarAccent({ r: NaN, g: 0, b: 0 })).toEqual(fallback)
  })
})
