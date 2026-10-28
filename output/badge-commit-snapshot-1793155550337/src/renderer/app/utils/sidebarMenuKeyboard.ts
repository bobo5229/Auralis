export function onMenuKeydown(event: KeyboardEvent): void {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const panel = event.currentTarget as HTMLElement
  const buttons = Array.from(
    panel.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
  ).filter(
    (button) => button.closest('[role="menu"]') === panel && button.getClientRects().length > 0,
  )
  if (!buttons.length) return
  event.preventDefault()
  event.stopPropagation()
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : index < 0
          ? event.key === 'ArrowDown'
            ? 0
            : buttons.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
  buttons[next]?.focus()
}
