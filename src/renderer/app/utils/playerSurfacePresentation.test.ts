import { describe, expect, it } from 'vitest'
import { resolvePlayerSurfacePresentation } from './playerSurfacePresentation'

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
