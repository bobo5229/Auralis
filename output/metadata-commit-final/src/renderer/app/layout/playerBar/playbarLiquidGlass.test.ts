import { describe, expect, it } from 'vitest'
import { isPlaybarLiquidSurface } from './playbarLiquidGlass'

describe('playbar liquid surface', () => {
  it('keeps the effect on the floating island', () => {
    expect(isPlaybarLiquidSurface('liquid', 'island')).toBe(true)
  })

  it('keeps the full-width bar and the other styles on their existing surfaces', () => {
    expect(isPlaybarLiquidSurface('liquid', 'full')).toBe(false)
    expect(isPlaybarLiquidSurface('plain', 'island')).toBe(false)
    expect(isPlaybarLiquidSurface('frosted', 'island')).toBe(false)
  })
})
