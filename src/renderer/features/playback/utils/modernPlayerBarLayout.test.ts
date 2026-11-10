import { describe, expect, it } from 'vitest'
import {
  DOCKED_PLAYER_BAR_UTILITIES_OVERFLOW_BELOW_PX,
  MODERN_PLAYER_BAR_UTILITIES_OVERFLOW_MAX_PX,
  shouldOverflowDockedUtilities,
  shouldOverflowModernUtilities,
} from './modernPlayerBarLayout'

describe('modernPlayerBarLayout', () => {
  it('keeps the docked controls separated at the narrow threshold', () => {
    expect(DOCKED_PLAYER_BAR_UTILITIES_OVERFLOW_BELOW_PX).toBe(512)
    expect(shouldOverflowDockedUtilities(480)).toBe(true)
    expect(shouldOverflowDockedUtilities(511)).toBe(true)
    expect(shouldOverflowDockedUtilities(512)).toBe(false)
  })

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
