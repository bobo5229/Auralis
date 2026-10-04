interface SidebarVisual {
  node: HTMLElement
  rect: DOMRect
  opacity: number
  target: boolean
  anchorX: number
}

/** Freeze sidebar geometry just like the album and Playbar snapshot layers. */
export function createSidebarLayoutTransition() {
  let root: HTMLElement | null = null
  let originalOpacity = ''
  let layer: HTMLElement | null = null
  let visuals: SidebarVisual[] = []
  let from: DOMRect | null = null
  let to: DOMRect | null = null
  let viewport: DOMRect | null = null
  let bounds: DOMRect | null = null
  let fromAnchorX = 0
  let toAnchorX = 0
  let visualAnchorX = 0

  function measureAnchor(sidebar: HTMLElement): number {
    const rect = (sidebar.querySelector('.sidebar-brand-mark') ?? sidebar).getBoundingClientRect()
    return rect.left + rect.width / 2
  }

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
      opacity: String(visual.opacity),
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
        const opacity = Number.parseFloat((child as HTMLElement).style.opacity)
        if (!(node instanceof HTMLElement) || opacity <= 0.001) continue
        captured.push({
          node: snapshot(node),
          rect: node.getBoundingClientRect(),
          opacity,
          target: false,
          anchorX: measureAnchor(node),
        })
      }
    } else {
      captured.push({
        node: snapshot(sidebar),
        rect: sidebar.getBoundingClientRect(),
        opacity: 1,
        target: false,
        anchorX: measureAnchor(sidebar),
      })
    }
    fromAnchorX = layer ? visualAnchorX : measureAnchor(sidebar)
    visualAnchorX = fromAnchorX
    from = viewport ?? sidebar.getBoundingClientRect()
    viewport = from
    bounds = from
    to = null
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
      zIndex: '25',
      pointerEvents: 'none',
      overflow: 'hidden',
      contain: 'layout paint',
      background: style.backgroundColor,
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
    toAnchorX = measureAnchor(root)
    visuals.push({ node: snapshot(root), rect: to, opacity: 1, target: true, anchorX: toAnchorX })
    layer.replaceChildren()
    setBounds(bounds)
    for (const visual of visuals) append(visual)
    restoreScroll()
    render(0)
  }

  function render(progress: number): void {
    if (!layer || !from || !to || !bounds) return
    const eased = 1 - Math.pow(1 - progress, 3)
    viewport = new DOMRect(
      from.left + (to.left - from.left) * eased,
      from.top + (to.top - from.top) * eased,
      from.width + (to.width - from.width) * eased,
      from.height + (to.height - from.height) * eased,
    )
    layer.style.clipPath = `inset(${viewport.top - bounds.top}px ${bounds.right - viewport.right}px ${bounds.bottom - viewport.bottom}px ${viewport.left - bounds.left}px)`
    visualAnchorX = fromAnchorX + (toAnchorX - fromAnchorX) * eased
    visuals.forEach((visual, index) => {
      const wrapper = layer!.children[index] as HTMLElement
      const dx = visual.target
        ? (fromAnchorX - toAnchorX) * (1 - eased)
        : (toAnchorX - visual.anchorX) * eased
      wrapper.style.transform = `translate3d(${dx}px, 0, 0)`
      wrapper.style.opacity = String(visual.opacity * (visual.target ? eased : 1 - eased))
    })
  }

  function clear(): void {
    layer?.remove()
    if (root) root.style.opacity = originalOpacity
    root = null
    layer = null
    visuals = []
    from = to = viewport = bounds = null
  }

  return { prepare, commit, render, clear, isActive: () => layer !== null }
}
