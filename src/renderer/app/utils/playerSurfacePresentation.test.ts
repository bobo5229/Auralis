import { describe, expect, it } from 'vitest'
import {
  resolvePlayerPaletteEnabled,
  resolvePlayerSurfacePresentation,
  resolvePlayerVisualEffectsActive,
} from './playerSurfacePresentation'

describe('resolvePlayerSurfacePresentation', () => {
  it('covers the ordinary window under the manuscript visual style', () => {
    expect(resolvePlayerSurfacePresentation('normal', 'manuscript')).toBe('manuscript')
  })

  it('keeps the ordinary window modern under the modern visual style', () => {
    expect(resolvePlayerSurfacePresentation('normal', 'modern')).toBe('modern')
  })

  it('never resolves fullscreen to manuscript (Phase 19 owns it)', () => {
    expect(resolvePlayerSurfacePresentation('fullscreen', 'manuscript')).toBe('modern')
    expect(resolvePlayerSurfacePresentation('fullscreen', 'modern')).toBe('modern')
  })

  it('never resolves mini mode to manuscript (Phase 20 owns it)', () => {
    expect(resolvePlayerSurfacePresentation('mini', 'manuscript')).toBe('modern')
    expect(resolvePlayerSurfacePresentation('mini', 'modern')).toBe('modern')
  })
})

describe('resolvePlayerVisualEffectsActive', () => {
  it('runs visual effects only while the ordinary surface is visible', () => {
    expect(resolvePlayerVisualEffectsActive('normal')).toBe(true)
    expect(resolvePlayerVisualEffectsActive('fullscreen')).toBe(false)
    expect(resolvePlayerVisualEffectsActive('mini')).toBe(false)
  })
})

describe('resolvePlayerPaletteEnabled', () => {
  it('starts palette only for the active modern player', () => {
    expect(resolvePlayerPaletteEnabled({ presentation: 'modern', displayMode: 'normal' })).toBe(true)
    expect(
      resolvePlayerPaletteEnabled({ presentation: 'modern', displayMode: 'fullscreen' }),
    ).toBe(false)
    expect(resolvePlayerPaletteEnabled({ presentation: 'modern', displayMode: 'mini' })).toBe(false)
    expect(
      resolvePlayerPaletteEnabled({ presentation: 'manuscript', displayMode: 'normal' }),
    ).toBe(false)
  })

  it('round-trips manuscript -> fullscreen -> normal without palette work on the hidden bar', () => {
    // manuscript normal: presentation is manuscript, no palette work
    expect(
      resolvePlayerPaletteEnabled({ presentation: 'manuscript', displayMode: 'normal' }),
    ).toBe(false)
    // opening fullscreen flips presentation to modern while the bar is hidden:
    // the gate must stay off so no palette worker starts underneath
    expect(
      resolvePlayerPaletteEnabled({ presentation: 'modern', displayMode: 'fullscreen' }),
    ).toBe(false)
    // returning to normal restores the manuscript presentation
    expect(
      resolvePlayerPaletteEnabled({ presentation: 'manuscript', displayMode: 'normal' }),
    ).toBe(false)
  })
})
