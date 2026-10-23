import type { Ref } from 'vue'

export function createPlayerBarLayoutTransition(shellRef: Ref<HTMLElement | null>) {
  let playerBarTransitionVisuals: Array<{
    node: HTMLElement
    rect: DOMRect
    opacity: number
  }> = []
  let playerBarTransitionLayers: HTMLElement[] = []
  let playerBarTranslationOffset: { x: number; y: number } | null = null
  let activePlayerBarIsland: HTMLElement | null = null
  function getPlayerBarIsland(): HTMLElement | null {
    return shellRef.value?.querySelector<HTMLElement>('.player-bar-island') ?? null
  }

  function capturePlayerBarTransitionVisuals(): void {
    playerBarTransitionVisuals = []
    for (const layer of playerBarTransitionLayers) {
      const island = layer.querySelector<HTMLElement>('.player-bar-island')
      if (!island) continue
      const rect = island.getBoundingClientRect()
      const opacity = Number.parseFloat(getComputedStyle(layer).opacity)
      if (rect.width > 0 && rect.height > 0 && opacity > 0.001) {
        playerBarTransitionVisuals.push({
          node: island.cloneNode(true) as HTMLElement,
          rect,
          opacity,
        })
      }
    }
    const current = getPlayerBarIsland()
    if (current) {
      const rect = current.getBoundingClientRect()
      const opacity = Number.parseFloat(getComputedStyle(current).opacity)
      if (rect.width > 0 && rect.height > 0 && opacity > 0.001) {
        playerBarTransitionVisuals.push({
          node: current.cloneNode(true) as HTMLElement,
          rect,
          opacity: Number.isFinite(opacity) ? opacity : 1,
        })
      }
    }
  }

  function removePlayerBarTransitionLayers(): void {
    playerBarTransitionLayers.forEach((layer) => layer.remove())
    playerBarTransitionLayers = []
  }

  function clonePlayerBarSnapshot(source: HTMLElement): HTMLElement {
    const clone = source.cloneNode(true) as HTMLElement
    clone.removeAttribute('id')
    clone.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'))
    clone.querySelectorAll<HTMLElement>('[tabindex]').forEach((element) => {
      element.tabIndex = -1
    })
    clone.style.width = '100%'
    clone.style.height = '100%'
    clone.style.margin = '0'
    // The wrapper owns opacity; a reversal must not multiply it by the captured island's opacity.
    clone.style.opacity = '1'
    return clone
  }

  function mountPlayerBarTransitionLayers(targetRect: DOMRect | null): void {
    removePlayerBarTransitionLayers()
    const host = shellRef.value?.querySelector<HTMLElement>('.player-bar')
    const hostStyle = host ? getComputedStyle(host) : null
    for (const visual of playerBarTransitionVisuals) {
      const layer = document.createElement('div')
      layer.className = 'player-bar lyrics-layout-playerbar-snapshot'
      layer.setAttribute('aria-hidden', 'true')
      layer.inert = true
      if (hostStyle) {
        for (let index = 0; index < hostStyle.length; index += 1) {
          const property = hostStyle.item(index)
          if (property.startsWith('--')) {
            layer.style.setProperty(property, hostStyle.getPropertyValue(property))
          }
        }
      }
      Object.assign(layer.style, {
        position: 'fixed',
        left: `${visual.rect.left}px`,
        top: `${visual.rect.top}px`,
        right: 'auto',
        bottom: 'auto',
        width: `${visual.rect.width}px`,
        height: `${visual.rect.height}px`,
        zIndex: '45',
        opacity: String(visual.opacity),
        overflow: 'visible',
        pointerEvents: 'none',
        transform: 'translate3d(0, 0, 0)',
      })
      layer.dataset.startOpacity = String(visual.opacity)
      layer.append(clonePlayerBarSnapshot(visual.node))
      document.body.append(layer)
      playerBarTransitionLayers.push(layer)
      const dx = targetRect ? targetRect.left - visual.rect.left : 0
      const dy = targetRect ? targetRect.top - visual.rect.top : 0
      layer.dataset.originLeft = String(visual.rect.left)
      layer.dataset.originTop = String(visual.rect.top)
      layer.dataset.targetLeft = String(targetRect?.left ?? visual.rect.left)
      layer.dataset.targetTop = String(targetRect?.top ?? visual.rect.top)
      layer.dataset.transitionDx = String(targetRect ? dx : 0)
      layer.dataset.transitionDy = String(targetRect ? dy : 0)
    }
    playerBarTransitionVisuals = []
    const current = getPlayerBarIsland()
    if (current) {
      activePlayerBarIsland = current
      current.style.opacity = '0'
    }
  }

  function retargetPlayerBarTransitionLayers(targetRect: DOMRect): void {
    for (const layer of playerBarTransitionLayers) {
      const originLeft = Number(layer.dataset.originLeft) || 0
      const originTop = Number(layer.dataset.originTop) || 0
      layer.dataset.targetLeft = String(targetRect.left)
      layer.dataset.targetTop = String(targetRect.top)
      layer.dataset.transitionDx = String(targetRect.left - originLeft)
      layer.dataset.transitionDy = String(targetRect.top - originTop)
    }
  }

  function clearPlayerBarTransition(): void {
    removePlayerBarTransitionLayers()
    playerBarTransitionVisuals = []
    playerBarTranslationOffset = null
    if (activePlayerBarIsland) {
      activePlayerBarIsland.style.removeProperty('opacity')
      activePlayerBarIsland.style.removeProperty('pointer-events')
      activePlayerBarIsland.style.removeProperty('transform')
    }
    activePlayerBarIsland = null
  }
  return {
    getIsland: getPlayerBarIsland,
    capture: capturePlayerBarTransitionVisuals,
    mount: mountPlayerBarTransitionLayers,
    retarget: retargetPlayerBarTransitionLayers,
    clear: clearPlayerBarTransition,
    get layers() {
      return playerBarTransitionLayers
    },
    get activeIsland() {
      return activePlayerBarIsland
    },
    set activeIsland(value: HTMLElement | null) {
      activePlayerBarIsland = value
    },
    get translationOffset() {
      return playerBarTranslationOffset
    },
    set translationOffset(value: { x: number; y: number } | null) {
      playerBarTranslationOffset = value
    },
  }
}
