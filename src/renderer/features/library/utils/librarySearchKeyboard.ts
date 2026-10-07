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
    document.querySelector('[role="menu"], [role="dialog"]')
  )
    return false

  const target = event.target
  return !(
    target instanceof HTMLElement &&
    (target.matches('input, textarea, select') || target.isContentEditable)
  )
}
