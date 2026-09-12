import { describe, expect, it } from 'vitest'
import { isPlayerVisualEffectsActive } from './playerVisualEffects'

describe('isPlayerVisualEffectsActive', () => {
  it('only enables the visible ordinary-window PlayerBar', () => {
    expect(isPlayerVisualEffectsActive('normal')).toBe(true)
    expect(isPlayerVisualEffectsActive('fullscreen')).toBe(false)
    expect(isPlayerVisualEffectsActive('mini')).toBe(false)
  })
})
