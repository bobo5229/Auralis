import { resolveRovingIndex } from '@renderer/features/appearance/utils/rovingIndex'

export type PlayerOverlayKind = 'queue' | 'mode-menu'

export type PlayerOverlayKeyAction =
  | { type: 'dismiss' }
  | { type: 'cycle-focus'; nextIndex: number }
  | { type: 'roving'; nextIndex: number }
  | { type: 'select' }
  | { type: 'keep-root' }
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
  if (input.key !== 'Tab') {
    return { type: 'none' }
  }

  // An empty or single-track queue has no interactive items; the dialog root
  // holds focus instead, so swallow Tab rather than letting it escape behind
  // the overlay.
  if (input.focusableCount === 0) {
    return { type: 'keep-root' }
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

/**
 * Pick the queue dialog's initial focus target: the active track's play
 * button when interactive, otherwise the first focusable item, otherwise the
 * dialog root itself. The root fallback covers empty and single-track queues,
 * which have no interactive items and must not let Tab land behind the dialog.
 */
export function resolveQueueInitialFocusTarget(input: {
  root: HTMLElement
  focusables: HTMLElement[]
}): HTMLElement {
  const activeItemButton = input.root
    .querySelector<HTMLElement>('.queue-item-active')
    ?.querySelector<HTMLElement>('button')
  if (activeItemButton) return activeItemButton
  return input.focusables[0] ?? input.root
}

/** Mode menu items use roving tabindex: only the currently focused one is
 * tabbable (tabindex 0) and the rest are -1, so the generic focusable
 * selector — which drops tabindex="-1" — cannot enumerate them. */
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
