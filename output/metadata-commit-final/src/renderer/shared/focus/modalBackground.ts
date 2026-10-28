const owners = new Map<HTMLElement, { count: number; previous: boolean }>()

/** Large dialogs and existing small sidebar dialogs share background ownership. */
export function acquireModalBackground(): () => void {
  const background = document.querySelector<HTMLElement>('[data-app-shell-root]')
  if (!background) return () => undefined
  const entry = owners.get(background) ?? { count: 0, previous: background.inert }
  entry.count++
  owners.set(background, entry)
  background.inert = true
  let released = false
  return () => {
    if (released) return
    released = true
    if (--entry.count === 0) {
      background.inert = entry.previous
      owners.delete(background)
    }
  }
}
