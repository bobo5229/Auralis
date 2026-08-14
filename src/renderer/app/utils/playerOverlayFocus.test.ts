import { describe, expect, it } from 'vitest'
import {
  canRestorePlayerFocus,
  getPlayerModeMenuItems,
  getPlayerOverlayFocusables,
  resolveModeMenuItemTabIndex,
  resolveModeMenuKeydown,
  resolvePlayerOverlayKeyAction,
  resolveQueueInitialFocusTarget,
  resolveRestorablePlayerTrigger,
} from './playerOverlayFocus'

describe('resolvePlayerOverlayKeyAction — queue dialog', () => {
  const base = { kind: 'queue' as const, shiftKey: false, focusableCount: 3, activeIndex: 0 }

  it('dismisses on Escape', () => {
    expect(resolvePlayerOverlayKeyAction({ ...base, key: 'Escape' })).toEqual({ type: 'dismiss' })
  })

  it('wraps Tab from the last control to the first', () => {
    expect(resolvePlayerOverlayKeyAction({ ...base, key: 'Tab', activeIndex: 2 })).toEqual({
      type: 'cycle-focus',
      nextIndex: 0,
    })
  })

  it('wraps Shift+Tab from the first control to the last', () => {
    expect(resolvePlayerOverlayKeyAction({ ...base, key: 'Tab', shiftKey: true })).toEqual({
      type: 'cycle-focus',
      nextIndex: 2,
    })
  })

  it('pulls stray focus back into the dialog', () => {
    expect(resolvePlayerOverlayKeyAction({ ...base, key: 'Tab', activeIndex: -1 })).toEqual({
      type: 'cycle-focus',
      nextIndex: 0,
    })
  })

  it('leaves in-range Tab to the browser', () => {
    expect(resolvePlayerOverlayKeyAction({ ...base, key: 'Tab', activeIndex: 1 })).toEqual({
      type: 'none',
    })
  })

  it('swallows Tab when the queue has no interactive items', () => {
    expect(resolvePlayerOverlayKeyAction({ ...base, focusableCount: 0, key: 'Tab' })).toEqual({
      type: 'keep-root',
    })
    expect(
      resolvePlayerOverlayKeyAction({ ...base, focusableCount: 0, key: 'Tab', shiftKey: true }),
    ).toEqual({
      type: 'keep-root',
    })
  })

  it('still dismisses an empty queue on Escape', () => {
    expect(resolvePlayerOverlayKeyAction({ ...base, focusableCount: 0, key: 'Escape' })).toEqual({
      type: 'dismiss',
    })
  })

  it('ignores arrows in the queue dialog', () => {
    expect(resolvePlayerOverlayKeyAction({ ...base, key: 'ArrowDown' })).toEqual({ type: 'none' })
  })
})

describe('resolvePlayerOverlayKeyAction — mode menu', () => {
  const base = { kind: 'mode-menu' as const, shiftKey: false, focusableCount: 5, activeIndex: 1 }

  it('dismisses on Escape', () => {
    expect(resolvePlayerOverlayKeyAction({ ...base, key: 'Escape' })).toEqual({ type: 'dismiss' })
  })

  it('moves roving focus with ArrowDown / ArrowUp / Home / End', () => {
    expect(resolvePlayerOverlayKeyAction({ ...base, key: 'ArrowDown' })).toEqual({
      type: 'roving',
      nextIndex: 2,
    })
    expect(resolvePlayerOverlayKeyAction({ ...base, key: 'ArrowUp' })).toEqual({
      type: 'roving',
      nextIndex: 0,
    })
    expect(resolvePlayerOverlayKeyAction({ ...base, key: 'Home' })).toEqual({
      type: 'roving',
      nextIndex: 0,
    })
    expect(resolvePlayerOverlayKeyAction({ ...base, key: 'End' })).toEqual({
      type: 'roving',
      nextIndex: 4,
    })
  })

  it('wraps roving focus around the ends', () => {
    expect(resolvePlayerOverlayKeyAction({ ...base, key: 'ArrowDown', activeIndex: 4 })).toEqual({
      type: 'roving',
      nextIndex: 0,
    })
    expect(resolvePlayerOverlayKeyAction({ ...base, key: 'ArrowUp', activeIndex: 0 })).toEqual({
      type: 'roving',
      nextIndex: 4,
    })
  })

  it('selects with Enter or Space', () => {
    expect(resolvePlayerOverlayKeyAction({ ...base, key: 'Enter' })).toEqual({ type: 'select' })
    expect(resolvePlayerOverlayKeyAction({ ...base, key: ' ' })).toEqual({ type: 'select' })
  })

  it('lets Tab exit the menu as a unit (roving tabindex)', () => {
    expect(resolvePlayerOverlayKeyAction({ ...base, key: 'Tab' })).toEqual({ type: 'none' })
    expect(resolvePlayerOverlayKeyAction({ ...base, key: 'Tab', shiftKey: true })).toEqual({
      type: 'none',
    })
  })

  it('returns none for unrelated keys', () => {
    expect(resolvePlayerOverlayKeyAction({ ...base, key: 'x' })).toEqual({ type: 'none' })
  })
})

describe('resolveModeMenuKeydown', () => {
  const base = { shiftKey: false, focusedIndex: 2, modeCount: 5 }

  it('dismisses on Escape', () => {
    expect(resolveModeMenuKeydown({ ...base, key: 'Escape' })).toEqual({ type: 'dismiss' })
  })

  it('moves roving focus and reports the target index', () => {
    expect(resolveModeMenuKeydown({ ...base, key: 'ArrowDown' })).toEqual({
      type: 'roving',
      nextIndex: 3,
    })
    expect(resolveModeMenuKeydown({ ...base, key: 'ArrowUp' })).toEqual({
      type: 'roving',
      nextIndex: 1,
    })
    expect(resolveModeMenuKeydown({ ...base, key: 'Home' })).toEqual({
      type: 'roving',
      nextIndex: 0,
    })
    expect(resolveModeMenuKeydown({ ...base, key: 'End' })).toEqual({
      type: 'roving',
      nextIndex: 4,
    })
  })

  it('selects the focused mode on Enter or Space', () => {
    expect(resolveModeMenuKeydown({ ...base, key: 'Enter' })).toEqual({
      type: 'select',
      modeIndex: 2,
    })
    expect(resolveModeMenuKeydown({ ...base, key: ' ' })).toEqual({
      type: 'select',
      modeIndex: 2,
    })
  })

  it('lets Tab exit the menu as a unit', () => {
    expect(resolveModeMenuKeydown({ ...base, key: 'Tab' })).toEqual({ type: 'none' })
    expect(resolveModeMenuKeydown({ ...base, key: 'Tab', shiftKey: true })).toEqual({
      type: 'none',
    })
  })
})

describe('mode menu item enumeration with roving tabindex', () => {
  function stubItem(tabIndex: number): HTMLElement {
    return { tabIndex, getClientRects: () => [{ width: 1 }] } as unknown as HTMLElement
  }

  it('keeps tabindex="-1" items that the generic focusable selector drops', () => {
    const current = stubItem(0)
    const roving = stubItem(-1)
    const root = { querySelectorAll: () => [current, roving] } as unknown as HTMLElement

    expect(getPlayerOverlayFocusables(root)).toHaveLength(1)
    expect(getPlayerModeMenuItems(root)).toHaveLength(2)
  })

  it('keeps only the focused item in the tab order', () => {
    expect(resolveModeMenuItemTabIndex(2, 2)).toBe(0)
    expect(resolveModeMenuItemTabIndex(2, 1)).toBe(-1)
    expect(resolveModeMenuItemTabIndex(2, 4)).toBe(-1)
  })

  it('leaves the menu out of the tab order before focus lands', () => {
    expect(resolveModeMenuItemTabIndex(-1, 0)).toBe(-1)
  })
})

describe('resolveQueueInitialFocusTarget', () => {
  // Minimal DOM stubs: the resolver only touches querySelector and the
  // precomputed focusables array, so a node environment can exercise it.
  function stubItem(id: string, buttonInside: unknown = null): HTMLElement {
    return {
      id,
      querySelector: (selector: string) => (selector === 'button' ? buttonInside : null),
    } as unknown as HTMLElement
  }

  function stubRoot(activeItem: unknown = null): HTMLElement {
    return {
      querySelector: (selector: string) => (selector === '.queue-item-active' ? activeItem : null),
    } as unknown as HTMLElement
  }

  it('prefers the active track play button when interactive', () => {
    const button = stubItem('play')
    const active = stubItem('active', button)
    const root = stubRoot(active)
    expect(resolveQueueInitialFocusTarget({ root, focusables: [] })).toBe(button)
  })

  it('falls back to the first focusable item', () => {
    const first = stubItem('first')
    const root = stubRoot(null)
    expect(resolveQueueInitialFocusTarget({ root, focusables: [first] })).toBe(first)
  })

  it('falls back to the dialog root for an empty queue', () => {
    const root = stubRoot(null)
    expect(resolveQueueInitialFocusTarget({ root, focusables: [] })).toBe(root)
  })

  it('falls back to the dialog root for a single-track queue', () => {
    // The now-playing section is a non-interactive div: no button inside and
    // no upcoming items, so the root must hold focus.
    const active = stubItem('active', null)
    const root = stubRoot(active)
    expect(resolveQueueInitialFocusTarget({ root, focusables: [] })).toBe(root)
  })
})

describe('canRestorePlayerFocus', () => {
  it('rejects disconnected, disabled, or overlay-owned triggers', () => {
    expect(canRestorePlayerFocus({ connected: false, disabled: false, insideOverlay: false })).toBe(
      false,
    )
    expect(canRestorePlayerFocus({ connected: true, disabled: true, insideOverlay: false })).toBe(
      false,
    )
    expect(canRestorePlayerFocus({ connected: true, disabled: false, insideOverlay: true })).toBe(
      false,
    )
  })

  it('accepts a live trigger outside the player overlay', () => {
    expect(canRestorePlayerFocus({ connected: true, disabled: false, insideOverlay: false })).toBe(
      true,
    )
  })

  it('resolves null for an unusable trigger', () => {
    expect(resolveRestorablePlayerTrigger(null)).toBeNull()
  })
})
