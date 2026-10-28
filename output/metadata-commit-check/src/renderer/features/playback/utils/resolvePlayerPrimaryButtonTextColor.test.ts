import { describe, expect, it } from 'vitest'
import {
  PLAYER_PRIMARY_BUTTON_DARK_TEXT,
  PLAYER_PRIMARY_BUTTON_LIGHT_TEXT,
  resolvePlayerPrimaryButtonTextColor,
} from './resolvePlayerPrimaryButtonTextColor'

describe('resolvePlayerPrimaryButtonTextColor', () => {
  it('uses light text for a dark accent', () => {
    expect(resolvePlayerPrimaryButtonTextColor({ r: 18, g: 24, b: 34 })).toBe(
      PLAYER_PRIMARY_BUTTON_LIGHT_TEXT,
    )
  })

  it('uses dark text for a light accent', () => {
    expect(resolvePlayerPrimaryButtonTextColor({ r: 234, g: 218, b: 178 })).toBe(
      PLAYER_PRIMARY_BUTTON_DARK_TEXT,
    )
  })

  it('uses dark text for a neutral mid-gray accent when it wins contrast', () => {
    expect(resolvePlayerPrimaryButtonTextColor({ r: 128, g: 128, b: 128 })).toBe(
      PLAYER_PRIMARY_BUTTON_DARK_TEXT,
    )
  })

  it('selects a readable foreground for the existing fallback accent', () => {
    expect(resolvePlayerPrimaryButtonTextColor({ r: 64, g: 92, b: 128 })).toBe(
      PLAYER_PRIMARY_BUTTON_LIGHT_TEXT,
    )
  })
})
