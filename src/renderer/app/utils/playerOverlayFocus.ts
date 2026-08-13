import { resolveRovingIndex } from '@renderer/features/appearance/utils/rovingIndex'

export type PlayerOverlayKind = 'queue' | 'mode-menu'

export type PlayerOverlayKeyAction =
  | { type: 'dismiss' }
  | { type: 'cycle-focus'; nextIndex: number }
  | { type: 'roving'; nextIndex: number }
  | { type: 'select' }
  | { type: 'none' }

export const PLAYER_OVERLAY_FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Key handling for the PlayerBar-owned overlays (queue dialog + playback mode
 * menu). The queue dialog traps Tab inside its focusables; the mode menu uses
 * roving focus with Arrow / Home / End and selects with Enter / Space. Escape
 * dismisses both so the trigger can be refocused (TECHDOC §8.1–8.2).
 */
export function resolvePlayerOverlayKeyAction(input: {
  key: string
  shiftKey: boolean
  kind: PlayerOverlayKind
  focusableCount: number
  activeIndex: number
}): PlayerOverlayKeyAction {
  if (input.key === 'Escape') {
    return { type: 'dismiss' }
  }

  if (input.kind === 'mode-menu') {
    const roving = resolveRovingIndex(input.activeIndex, input.focusableCount, input.key)
    if (roving !== null) {
      return { type: 'roving', nextIndex: roving }
    }

    if (input.key === 'Enter' || input.key === ' ') {
      return input.activeIndex >= 0 ? { type: 'select' } : { type: 'none' }
    }

    return { type: 'none' }
  }

  // Queue dialog: keep Tab inside the dialog.
  if (input.key !== 'Tab' || input.focusableCount === 0) {
    return { type: 'none' }
  }

  if (input.activeIndex < 0) {
    return { type: 'cycle-focus', nextIndex: input.shiftKey ? input.focusableCount - 1 : 0 }
  }

  if (input.shiftKey && input.activeIndex === 0) {
    return { type: 'cycle-focus', nextIndex: input.focusableCount - 1 }
  }

  if (!input.shiftKey && input.activeIndex === input.focusableCount - 1) {
    return { type: 'cycle-focus', nextIndex: 0 }
  }

  return { type: 'none' }
}

export function canRestorePlayerFocus(input: {
  connected: boolean
  disabled: boolean
  insideOverlay: boolean
}): boolean {
  return input.connected && !input.disabled && !input.insideOverlay
}

/** Restore focus to the overlay trigger only when it is still usable. */
export function resolveRestorablePlayerTrigger(candidate: HTMLElement | null): HTMLElement | null {
  if (!candidate) return null
  if (
    canRestorePlayerFocus({
      connected: candidate.isConnected,
      disabled: candidate.hasAttribute('disabled'),
      insideOverlay: candidate.closest('.player-overlay') !== null,
    })
  ) {
    return candidate
  }
  return null
}

export function getPlayerOverlayFocusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(PLAYER_OVERLAY_FOCUSABLE_SELECTOR)).filter(
    (element) => element.tabIndex >= 0 && element.getClientRects().length > 0,
  )
}
