import { describe, expect, it } from 'vitest'
import {
  MODERN_PLAYER_BAR_UTILITIES_OVERFLOW_MAX_PX,
  shouldOverflowModernUtilities,
} from './modernPlayerBarLayout'

describe('modernPlayerBarLayout', () => {
  it('moves lyrics and mode behind overflow at or below 640px', () => {
    expect(shouldOverflowModernUtilities(MODERN_PLAYER_BAR_UTILITIES_OVERFLOW_MAX_PX)).toBe(true)
    expect(shouldOverflowModernUtilities(MODERN_PLAYER_BAR_UTILITIES_OVERFLOW_MAX_PX - 1)).toBe(
      true,
    )
    expect(shouldOverflowModernUtilities(MODERN_PLAYER_BAR_UTILITIES_OVERFLOW_MAX_PX + 1)).toBe(
      false,
    )
    expect(MODERN_PLAYER_BAR_UTILITIES_OVERFLOW_MAX_PX).toBe(640)
  })
})
