import { describe, expect, it } from 'vitest'
import { PLAYER_DEFAULT_ACCENT_DARK, PLAYER_DEFAULT_ACCENT_LIGHT } from './playerColorDefaults'
import { resolvePlaybarAccent } from './resolvePlaybarAccent'
import { FALLBACK_PALETTE } from './extractArtworkPalette'

describe('playerColorDefaults', () => {
  it('defines exact RGB values for dark and light accent defaults', () => {
    expect(PLAYER_DEFAULT_ACCENT_DARK).toEqual({ r: 143, g: 167, b: 187 })
    expect(PLAYER_DEFAULT_ACCENT_LIGHT).toEqual({ r: 120, g: 135, b: 121 })
  })

  it('freezes the default color objects to prevent runtime mutation', () => {
    expect(Object.isFrozen(PLAYER_DEFAULT_ACCENT_DARK)).toBe(true)
    expect(Object.isFrozen(PLAYER_DEFAULT_ACCENT_LIGHT)).toBe(true)
  })

  it('is the exact single source of truth for resolvePlaybarAccent fallbacks', () => {
    expect(resolvePlaybarAccent(null, true)).toEqual(PLAYER_DEFAULT_ACCENT_DARK)
    expect(resolvePlaybarAccent(null, false)).toEqual(PLAYER_DEFAULT_ACCENT_LIGHT)
  })

  it('is the exact single source of truth for FALLBACK_PALETTE primary accent', () => {
    expect(FALLBACK_PALETTE.accents[0].rgb).toEqual(PLAYER_DEFAULT_ACCENT_DARK)
  })
})
