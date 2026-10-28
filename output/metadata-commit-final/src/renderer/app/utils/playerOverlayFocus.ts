import { resolveRovingIndex } from '@renderer/features/appearance/utils/rovingIndex'

export type PlayerOverlayKeyAction =
  | { type: 'dismiss' }
  | { type: 'roving'; nextIndex: number }
  | { type: 'select' }
  | { type: 'none' }

export function resolvePlayerOverlayKeyAction(input: {
  key: string
  shiftKey: boolean
  kind: 'mode-menu'
  focusableCount: number
  activeIndex: number
}): PlayerOverlayKeyAction {
  if (input.key === 'Escape') return { type: 'dismiss' }
  const roving = resolveRovingIndex(input.activeIndex, input.focusableCount, input.key)
  if (roving !== null) return { type: 'roving', nextIndex: roving }
  if (input.key === 'Enter' || input.key === ' ') {
    return input.activeIndex >= 0 ? { type: 'select' } : { type: 'none' }
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

/** Include every visible mode item in arrow-key navigation, including tabindex -1. */
export const PLAYER_MODE_MENU_ITEM_SELECTOR = '.playback-mode-item:not([disabled])'

export function getPlayerModeMenuItems(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(PLAYER_MODE_MENU_ITEM_SELECTOR)).filter(
    (element) => element.getClientRects().length > 0,
  )
}

/** Roving tabindex binding: only the focused item stays in the tab order, so
 * Tab steps out of the menu as a unit instead of through every item. */
export function resolveModeMenuItemTabIndex(focusedIndex: number, itemIndex: number): 0 | -1 {
  return itemIndex === focusedIndex ? 0 : -1
}

export type ModeMenuKeydownResult =
  | { type: 'dismiss' }
  | { type: 'roving'; nextIndex: number }
  | { type: 'select'; modeIndex: number }
  | { type: 'none' }

/**
 * Decision layer for the mode menu keydown: turns a key into the menu state
 * transition (roving move, selection of the focused mode, or Escape dismiss)
 * so the component only applies focus and emits. Tab resolves to `none`:
 * with roving tabindex the browser exits the menu as a unit.
 */
export function resolveModeMenuKeydown(input: {
  key: string
  shiftKey: boolean
  focusedIndex: number
  modeCount: number
}): ModeMenuKeydownResult {
  const action = resolvePlayerOverlayKeyAction({
    key: input.key,
    shiftKey: input.shiftKey,
    kind: 'mode-menu',
    focusableCount: input.modeCount,
    activeIndex: input.focusedIndex,
  })

  if (action.type === 'roving') {
    return { type: 'roving', nextIndex: action.nextIndex }
  }
  if (action.type === 'select') {
    return { type: 'select', modeIndex: input.focusedIndex }
  }
  if (action.type === 'dismiss') {
    return { type: 'dismiss' }
  }
  return { type: 'none' }
}
