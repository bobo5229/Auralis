import { describe, expect, it } from 'vitest'
import {
  ARTWORK_PRIMARY_BUTTON_DARK_TEXT,
  ARTWORK_PRIMARY_BUTTON_LIGHT_TEXT,
  resolveArtworkButtonTextColor,
} from '@renderer/shared/color/resolveArtworkButtonTextColor'

describe('resolveArtworkButtonTextColor', () => {
  it('uses light text for a dark accent', () => {
    expect(resolveArtworkButtonTextColor({ r: 18, g: 24, b: 34 })).toBe(
      ARTWORK_PRIMARY_BUTTON_LIGHT_TEXT,
    )
  })

  it('uses dark text for a light accent', () => {
    expect(resolveArtworkButtonTextColor({ r: 234, g: 218, b: 178 })).toBe(
      ARTWORK_PRIMARY_BUTTON_DARK_TEXT,
    )
  })

  it('uses dark text for a neutral mid-gray accent when it wins contrast', () => {
    expect(resolveArtworkButtonTextColor({ r: 128, g: 128, b: 128 })).toBe(
      ARTWORK_PRIMARY_BUTTON_DARK_TEXT,
    )
  })

  it('selects a readable foreground for the existing fallback accent', () => {
    expect(resolveArtworkButtonTextColor({ r: 64, g: 92, b: 128 })).toBe(
      ARTWORK_PRIMARY_BUTTON_LIGHT_TEXT,
    )
  })
})
