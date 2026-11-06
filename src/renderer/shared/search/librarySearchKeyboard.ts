/** Hidden, mounted panels do not own page keyboard shortcuts. */
export function hasVisiblePageOverlay(): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="menu"], [role="dialog"]')).some(
    (element) =>
      element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden',
  )
}

/** Page-level Escape must yield to editors and overlays that own the key. */
export function canDismissPageSearch(event: KeyboardEvent): boolean {
  if (
    event.key !== 'Escape' ||
    event.defaultPrevented ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    hasVisiblePageOverlay()
  )
    return false

  const target = event.target
  return !(
    target instanceof HTMLElement &&
    (target.matches('input, textarea, select') || target.isContentEditable)
  )
}
