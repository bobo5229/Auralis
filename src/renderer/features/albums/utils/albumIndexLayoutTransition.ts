const PROPERTIES = ['position', 'left', 'right', 'top', 'bottom', 'width', 'height', 'transform']

/** Keep the live index outside the main pane's shrinking overflow clip during FLIP. */
export function createAlbumIndexLayoutTransition(getIndex: () => HTMLElement | null) {
  let node: HTMLElement | null = null
  let from: DOMRect | null = null
  let offset = { x: 0, y: 0 }
  let saved: { name: string; value: string; priority: string }[] = []
  let animation: Animation | null = null

  function restore() {
    if (!node) return
    for (const { name, value, priority } of saved) {
      if (value) node.style.setProperty(name, value, priority)
      else node.style.removeProperty(name)
    }
  }
  function pin(rect: DOMRect) {
    if (!node) return
    Object.assign(node.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      right: 'auto',
      bottom: 'auto',
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      transform: 'none',
    })
  }
  function clear() {
    animation?.cancel()
    animation = null
    restore()
    node = null
    from = null
    saved = []
  }
  function prepare() {
    const next = getIndex()
    if (next !== node) clear()
    if (!next) return
    // Capture before cancellation so a reversal continues from its painted position.
    from = next.getBoundingClientRect()
    animation?.cancel()
    animation = null
    if (!node) {
      node = next
      saved = PROPERTIES.map((name) => ({
        name,
        value: next.style.getPropertyValue(name),
        priority: next.style.getPropertyPriority(name),
      }))
    }
    pin(from)
  }
  function commit() {
    if (!node || !from) return
    restore()
    const target = node.getBoundingClientRect()
    pin(target)
    offset = { x: from.left - target.left, y: from.top - target.top }
    node.style.transform = `translate3d(${offset.x}px, ${offset.y}px, 0)`
  }
  function animate(duration: number) {
    if (!node || !from) return
    animation = node.animate(
      [
        { transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` },
        { transform: 'translate3d(0, 0, 0)' },
      ],
      { duration, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' },
    )
  }
  return { prepare, commit, animate, clear }
}
