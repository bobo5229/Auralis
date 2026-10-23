import { describe, expect, it } from 'vitest'
import { LIQUID_GLASS_DEFAULTS } from './liquidGlass'

describe('liquidGlass defaults', () => {
  it('keeps the upstream default strength', () => {
    expect(LIQUID_GLASS_DEFAULTS).toEqual({
      scale: -112,
      chroma: 6,
      border: 0.07,
      mapBlur: 12,
      blur: 3,
      saturate: 1.5,
      radius: null,
      fallbackBlur: 16,
    })
  })
})
