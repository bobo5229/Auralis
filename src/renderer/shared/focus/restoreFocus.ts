export function canRestoreFocus(input: {
  connected: boolean
  disabled: boolean
  insideOverlay: boolean
}): boolean {
  return input.connected && !input.disabled && !input.insideOverlay
}

export function resolveRestorableFocusTarget(
  candidate: HTMLElement | null,
  excludedAncestorSelector?: string,
): HTMLElement | null {
  if (!candidate) return null
  if (
    canRestoreFocus({
      connected: candidate.isConnected,
      disabled: candidate.hasAttribute('disabled'),
      insideOverlay:
        !!excludedAncestorSelector && candidate.closest(excludedAncestorSelector) !== null,
    })
  ) {
    return candidate
  }
  return null
}
