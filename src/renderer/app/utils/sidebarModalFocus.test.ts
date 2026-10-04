import { describe, expect, it } from 'vitest'
import { canRestoreSidebarFocus } from './sidebarModalFocus'

describe('canRestoreSidebarFocus', () => {
  it('rejects disconnected, disabled, or overlay-owned nodes', () => {
    expect(
      canRestoreSidebarFocus({ connected: false, disabled: false, insideOverlay: false }),
    ).toBe(false)
    expect(canRestoreSidebarFocus({ connected: true, disabled: true, insideOverlay: false })).toBe(
      false,
    )
    expect(canRestoreSidebarFocus({ connected: true, disabled: false, insideOverlay: true })).toBe(
      false,
    )
  })

  it('accepts a live trigger outside Sidebar overlays', () => {
    expect(canRestoreSidebarFocus({ connected: true, disabled: false, insideOverlay: false })).toBe(
      true,
    )
  })
})
