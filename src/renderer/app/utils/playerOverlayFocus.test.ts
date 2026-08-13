import { describe, expect, it } from 'vitest'
import {
  canRestorePlayerFocus,
  resolvePlayerOverlayKeyAction,
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

  it('returns none for unrelated keys', () => {
    expect(resolvePlayerOverlayKeyAction({ ...base, key: 'x' })).toEqual({ type: 'none' })
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
