import { describe, expect, it } from 'vitest'
import { canRestoreFocus, resolveRestorableFocusTarget } from './restoreFocus'

describe('canRestoreFocus', () => {
  it('rejects disconnected, disabled, or overlay-owned nodes', () => {
    expect(canRestoreFocus({ connected: false, disabled: false, insideOverlay: false })).toBe(false)
    expect(canRestoreFocus({ connected: true, disabled: true, insideOverlay: false })).toBe(false)
    expect(canRestoreFocus({ connected: true, disabled: false, insideOverlay: true })).toBe(false)
  })

  it('accepts a live trigger outside excluded overlays', () => {
    expect(canRestoreFocus({ connected: true, disabled: false, insideOverlay: false })).toBe(true)
  })
})

describe('resolveRestorableFocusTarget', () => {
  function candidate(connected: boolean, disabled: boolean, insideOverlay: boolean): HTMLElement {
    return {
      isConnected: connected,
      hasAttribute: (name: string) => name === 'disabled' && disabled,
      closest: (selector: string) =>
        selector === '.excluded-overlay' && insideOverlay ? {} : null,
    } as HTMLElement
  }

  it('rejects missing, disconnected and disabled targets', () => {
    expect(resolveRestorableFocusTarget(null)).toBeNull()
    expect(resolveRestorableFocusTarget(candidate(false, false, false))).toBeNull()
    expect(resolveRestorableFocusTarget(candidate(true, true, false))).toBeNull()
  })

  it('lets the caller exclude its own overlay without imposing a shell selector', () => {
    const target = candidate(true, false, true)
    expect(resolveRestorableFocusTarget(target)).toBe(target)
    expect(resolveRestorableFocusTarget(target, '.excluded-overlay')).toBeNull()
    expect(resolveRestorableFocusTarget(target, '.other-overlay')).toBe(target)
  })

  it('returns a connected enabled target outside the excluded overlay', () => {
    const target = candidate(true, false, false)
    expect(resolveRestorableFocusTarget(target, '.excluded-overlay')).toBe(target)
  })
})
