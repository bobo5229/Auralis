export type SidebarModalKeyAction =
  | { type: 'dismiss' }
  | { type: 'cycle-focus'; nextIndex: number }
  | { type: 'none' }

export const SIDEBAR_MODAL_FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function resolveSidebarModalKeyAction(input: {
  key: string
  shiftKey: boolean
  canDismiss: boolean
  focusableCount: number
  activeIndex: number
}): SidebarModalKeyAction {
  if (input.key === 'Escape') {
    return input.canDismiss ? { type: 'dismiss' } : { type: 'none' }
  }

  if (input.key !== 'Tab' || input.focusableCount === 0) {
    return { type: 'none' }
  }

  if (input.activeIndex < 0) {
    return {
      type: 'cycle-focus',
      nextIndex: input.shiftKey ? input.focusableCount - 1 : 0,
    }
  }

  if (input.shiftKey && input.activeIndex === 0) {
    return { type: 'cycle-focus', nextIndex: input.focusableCount - 1 }
  }

  if (!input.shiftKey && input.activeIndex === input.focusableCount - 1) {
    return { type: 'cycle-focus', nextIndex: 0 }
  }

  return { type: 'none' }
}

export function canRestoreSidebarFocus(input: {
  connected: boolean
  disabled: boolean
  insideOverlay: boolean
}): boolean {
  return input.connected && !input.disabled && !input.insideOverlay
}

export function resolveRestorableFocusTarget(candidate: HTMLElement | null): HTMLElement | null {
  if (!candidate) return null
  if (
    canRestoreSidebarFocus({
      connected: candidate.isConnected,
      disabled: candidate.hasAttribute('disabled'),
      insideOverlay: candidate.closest('.sidebar-overlay') !== null,
    })
  ) {
    return candidate
  }
  return null
}

export function getSidebarModalFocusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(SIDEBAR_MODAL_FOCUSABLE_SELECTOR)).filter(
    (element) => element.tabIndex >= 0 && element.getClientRects().length > 0,
  )
}
