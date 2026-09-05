import { describe, expect, it } from 'vitest'
import { resolveShellPresentation } from './shellPresentation'

describe('resolveShellPresentation', () => {
  it('enables manuscript only on the ordinary main-window modes', () => {
    expect(resolveShellPresentation('normal', 'manuscript')).toBe('manuscript')
    expect(resolveShellPresentation('fullscreen', 'manuscript')).toBe('manuscript')
  })

  it('keeps Miniplayer modern even when the saved style is manuscript', () => {
    expect(resolveShellPresentation('mini', 'manuscript')).toBe('modern')
    expect(resolveShellPresentation('mini', 'modern')).toBe('modern')
  })

  it('keeps every display mode modern when the saved style is modern', () => {
    expect(resolveShellPresentation('normal', 'modern')).toBe('modern')
    expect(resolveShellPresentation('fullscreen', 'modern')).toBe('modern')
    expect(resolveShellPresentation('mini', 'modern')).toBe('modern')
  })
})
