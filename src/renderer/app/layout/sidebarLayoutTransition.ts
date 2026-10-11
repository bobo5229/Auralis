interface SidebarVisual {
  node: HTMLElement
  rect: DOMRect
  opacity: number
  target: boolean
}

/** Freeze sidebar geometry just like the album and Playbar snapshot layers. */
export function createSidebarLayoutTransition() {
  let root: HTMLElement | null = null
  let originalOpacity = ''
  let layer: HTMLElement | null = null
  let visuals: SidebarVisual[] = []
  let from: DOMRect | null = null
  let to: DOMRect | null = null
  let bounds: DOMRect | null = null
  let animations: Animation[] = []

  function snapshot(source: HTMLElement): HTMLElement {
    const clone = source.cloneNode(true) as HTMLElement
    const originals = [source, ...source.querySelectorAll<HTMLElement>('*')]
    const copies = [clone, ...clone.querySelectorAll<HTMLElement>('*')]
    for (const [index, element] of copies.entries()) {
      element.removeAttribute('id')
      element.removeAttribute('autofocus')
      element.removeAttribute('contenteditable')
      if (element.hasAttribute('tabindex')) element.tabIndex = -1
      for (const attribute of Array.from(element.attributes)) {
        if (/^on/iu.test(attribute.name)) element.removeAttribute(attribute.name)
      }
      // Clones retain the rendered state without starting another CSS transition.
      element.style.transition = 'none'
      element.style.animation = 'none'
      const scrollTop = originals[index].scrollTop
      if (scrollTop > 0) element.dataset.sidebarSnapshotScrollTop = String(scrollTop)
    }
    Object.assign(clone.style, { width: '100%', height: '100%', margin: '0', opacity: '1' })
    return clone
  }

  function restoreScroll(): void {
    layer
      ?.querySelectorAll<HTMLElement>('[data-sidebar-snapshot-scroll-top]')
      .forEach((element) => {
        element.scrollTop = Number(element.dataset.sidebarSnapshotScrollTop)
        delete element.dataset.sidebarSnapshotScrollTop
      })
  }

  function append(visual: SidebarVisual): void {
    if (!layer || !bounds) return
    const wrapper = document.createElement('div')
    Object.assign(wrapper.style, {
      position: 'absolute',
      left: `${visual.rect.left - bounds.left}px`,
      top: `${visual.rect.top - bounds.top}px`,
      width: `${visual.rect.width}px`,
      height: `${visual.rect.height}px`,
      opacity: String(visual.target ? 0 : visual.opacity),
      transform: 'translate3d(0, 0, 0)',
    })
    wrapper.append(visual.node)
    layer.append(wrapper)
  }

  function setBounds(rect: DOMRect): void {
    if (!layer) return
    Object.assign(layer.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    })
  }

  function prepare(sidebar: HTMLElement): void {
    const captured: SidebarVisual[] = []
    if (layer) {
      for (const child of layer.children) {
        const node = child.firstElementChild
        const opacity = Number.parseFloat(getComputedStyle(child).opacity)
        if (!(node instanceof HTMLElement) || opacity <= 0.001) continue
        captured.push({
          node: snapshot(node),
          rect: node.getBoundingClientRect(),
          opacity,
          target: false,
        })
      }
    } else {
      captured.push({
        node: snapshot(sidebar),
        rect: sidebar.getBoundingClientRect(),
        opacity: 1,
        target: false,
      })
    }
    from = layer?.getBoundingClientRect() ?? sidebar.getBoundingClientRect()
    bounds = from
    to = null
    animations.forEach((animation) => animation.cancel())
    animations = []
    layer?.remove()
    if (root !== sidebar) {
      if (root) root.style.opacity = originalOpacity
      root = sidebar
      originalOpacity = sidebar.style.opacity
    }
    const style = getComputedStyle(sidebar)
    layer = document.createElement('div')
    layer.className = 'sidebar-layout-snapshot'
    layer.setAttribute('aria-hidden', 'true')
    layer.inert = true
    for (let index = 0; index < style.length; index += 1) {
      const property = style.item(index)
      if (property.startsWith('--'))
        layer.style.setProperty(property, style.getPropertyValue(property))
    }
    Object.assign(layer.style, {
      position: 'fixed',
      // A departing grid must not paint over the incoming navigation surface.
      zIndex: '46',
      pointerEvents: 'none',
      overflow: 'hidden',
      contain: 'layout paint',
      color: style.color,
      font: style.font,
    })
    setBounds(bounds)
    visuals = captured
    for (const visual of visuals) append(visual)
    document.body.append(layer)
    restoreScroll()
    sidebar.style.opacity = '0'
  }

  function commit(): void {
    if (!root || !from || !layer) return
    to = root.getBoundingClientRect()
    const left = Math.min(from.left, to.left)
    const top = Math.min(from.top, to.top)
    bounds = new DOMRect(
      left,
      top,
      Math.max(from.right, to.right) - left,
      Math.max(from.bottom, to.bottom) - top,
    )
    visuals.push({ node: snapshot(root), rect: to, opacity: 1, target: true })
    layer.replaceChildren()
    setBounds(bounds)
    for (const visual of visuals) append(visual)
    restoreScroll()
  }

  async function animate(duration: number): Promise<void> {
    if (!layer || !from || !to) return
    const direction = to.width < from.width ? -1 : 1
    for (const [index, visual] of visuals.entries()) {
      const wrapper = layer.children[index] as HTMLElement
      animations.push(
        wrapper.animate(
          visual.target
            ? [
                { opacity: 0, transform: `translateX(${-direction * 8}px)` },
                { opacity: 1, transform: 'translateX(0)' },
              ]
            : [
                { opacity: visual.opacity, transform: 'translateX(0)' },
                { opacity: 0, transform: `translateX(${direction * 8}px)` },
              ],
          { duration, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' },
        ),
      )
    }
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)))
  }
  function clear(): void {
    animations.forEach((animation) => animation.cancel())
    animations = []
    layer?.remove()
    if (root) root.style.opacity = originalOpacity
    root = null
    layer = null
    visuals = []
    from = to = bounds = null
  }

  return { prepare, commit, animate, clear, isActive: () => layer !== null }
}
