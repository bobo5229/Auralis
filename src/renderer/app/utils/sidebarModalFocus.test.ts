import { describe, expect, it } from 'vitest'
import { canRestoreSidebarFocus, resolveSidebarModalKeyAction } from './sidebarModalFocus'

describe('resolveSidebarModalKeyAction', () => {
  it('dismisses on Escape when the dialog allows it', () => {
    expect(
      resolveSidebarModalKeyAction({
        key: 'Escape',
        shiftKey: false,
        canDismiss: true,
        focusableCount: 2,
        activeIndex: 0,
      }),
    ).toEqual({ type: 'dismiss' })
  })

  it('keeps Escape inert while the dialog cannot dismiss', () => {
    expect(
      resolveSidebarModalKeyAction({
        key: 'Escape',
        shiftKey: false,
        canDismiss: false,
        focusableCount: 2,
        activeIndex: 0,
      }),
    ).toEqual({ type: 'none' })
  })

  it('wraps Tab from the last control to the first', () => {
    expect(
      resolveSidebarModalKeyAction({
        key: 'Tab',
        shiftKey: false,
        canDismiss: true,
        focusableCount: 3,
        activeIndex: 2,
      }),
    ).toEqual({ type: 'cycle-focus', nextIndex: 0 })
  })

  it('wraps Shift+Tab from the first control to the last', () => {
    expect(
      resolveSidebarModalKeyAction({
        key: 'Tab',
        shiftKey: true,
        canDismiss: true,
        focusableCount: 3,
        activeIndex: 0,
      }),
    ).toEqual({ type: 'cycle-focus', nextIndex: 2 })
  })

  it('pulls stray focus back into the dialog', () => {
    expect(
      resolveSidebarModalKeyAction({
        key: 'Tab',
        shiftKey: false,
        canDismiss: true,
        focusableCount: 2,
        activeIndex: -1,
      }),
    ).toEqual({ type: 'cycle-focus', nextIndex: 0 })
  })

  it('leaves in-range Tab to the browser', () => {
    expect(
      resolveSidebarModalKeyAction({
        key: 'Tab',
        shiftKey: false,
        canDismiss: true,
        focusableCount: 3,
        activeIndex: 1,
      }),
    ).toEqual({ type: 'none' })
  })
})

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
