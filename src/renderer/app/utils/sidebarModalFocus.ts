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
