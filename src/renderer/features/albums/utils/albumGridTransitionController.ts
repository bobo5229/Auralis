import { planAlbumGridTransition } from './albumGridTransitionPlan'

export interface AlbumTransitionRect {
  left: number
  top: number
  width: number
  height: number
}

export interface AlbumTransitionVisual {
  key: string
  node: HTMLElement
  rect: AlbumTransitionRect
  opacity: number
  /** The node is already a sanitized copy owned by the transition layer. */
  snapshotOwned?: boolean
}

export interface AlbumTransitionTarget {
  key: string
  node: HTMLElement
  rect: AlbumTransitionRect
}

export interface AlbumTransitionSourcePlan {
  key: string
  rect: AlbumTransitionRect
  opacity: number
  destination: AlbumTransitionRect | null
}

export interface AlbumTransitionItemOptions {
  key: string
  side: 'from' | 'to'
  node: HTMLElement
  rect: AlbumTransitionRect
  opacity: number
  snapshotOwned: boolean
}

export interface AlbumGridTransitionLayerHost {
  reset(): void
  setBounds(bounds: AlbumTransitionRect): void
  createItem(
    options: AlbumTransitionItemOptions,
    origin: Pick<AlbumTransitionRect, 'left' | 'top'>,
  ): HTMLElement
  appendItem(item: HTMLElement): void
  setItemPosition(item: HTMLElement, left: number, top: number): void
  renderViewport(viewport: AlbumTransitionRect, union: AlbumTransitionRect): void
  renderItem(item: HTMLElement, transform: string, opacity: number): void
  captureItem(item: HTMLElement): AlbumTransitionVisual | null
  isConnected(item: HTMLElement): boolean
}

interface TransitionLayerItem extends AlbumTransitionSourcePlan {
  side: 'from' | 'to'
  element: HTMLElement
}

function clampOpacity(opacity: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(opacity) ? opacity : 1))
}

function unionRect(from: AlbumTransitionRect, to: AlbumTransitionRect): AlbumTransitionRect {
  const left = Math.min(from.left, to.left)
  const top = Math.min(from.top, to.top)
  const right = Math.max(from.left + from.width, to.left + to.width)
  const bottom = Math.max(from.top + from.height, to.top + to.height)
  return { left, top, width: right - left, height: bottom - top }
}

export function createAlbumGridTransitionController(host: AlbumGridTransitionLayerHost) {
  let items: TransitionLayerItem[] = []
  let viewportFrom: AlbumTransitionRect = { left: 0, top: 0, width: 0, height: 0 }
  let viewportTo = viewportFrom
  let currentViewport = viewportFrom
  let viewportUnion: AlbumTransitionRect = { left: 0, top: 0, width: 0, height: 0 }

  function clear(): void {
    items = []
    viewportFrom = { left: 0, top: 0, width: 0, height: 0 }
    viewportTo = viewportFrom
    currentViewport = viewportFrom
    viewportUnion = viewportFrom
    host.reset()
  }

  function prepareSources(
    viewport: AlbumTransitionRect,
    sources: readonly AlbumTransitionVisual[],
  ): void {
    clear()
    try {
      viewportFrom = { ...viewport }
      viewportTo = viewportFrom
      currentViewport = viewportFrom
      viewportUnion = unionRect(viewportFrom, viewportTo)
      host.setBounds(viewportUnion)

      const seen = new Set<string>()
      for (const source of sources) {
        if (seen.has(source.key)) continue
        seen.add(source.key)
        const opacity = clampOpacity(source.opacity)
        const element = host.createItem(
          {
            key: source.key,
            side: 'from',
            node: source.node,
            rect: source.rect,
            opacity,
            snapshotOwned: source.snapshotOwned === true,
          },
          viewportUnion,
        )
        host.appendItem(element)
        items.push({
          key: source.key,
          side: 'from',
          element,
          rect: source.rect,
          opacity,
          destination: null,
        })
      }
      renderProgress(0)
    } catch (error) {
      clear()
      throw error
    }
  }

  function commitTargets(
    viewport: AlbumTransitionRect,
    targets: readonly AlbumTransitionTarget[],
  ): void {
    try {
      const sources = items.filter((item) => item.side === 'from')
      const { from: plannedSources, to: addedTargets } = planAlbumGridTransition(sources, targets)
      const sourcePlans = new Map(plannedSources.map((item) => [item.key, item]))
      const nextUnion = unionRect(viewportFrom, viewport)

      host.setBounds(nextUnion)
      viewportTo = { ...viewport }
      viewportUnion = nextUnion

      for (const source of sources) {
        const plan = sourcePlans.get(source.key)
        source.destination = plan?.destination ?? null
        host.setItemPosition(
          source.element,
          source.rect.left - viewportUnion.left,
          source.rect.top - viewportUnion.top,
        )
      }

      const addedKeys = new Set<string>()
      for (const target of addedTargets) {
        if (addedKeys.has(target.key)) continue
        addedKeys.add(target.key)
        const element = host.createItem(
          {
            key: target.key,
            side: 'to',
            node: target.node,
            rect: target.rect,
            opacity: 0,
            snapshotOwned: false,
          },
          viewportUnion,
        )
        host.appendItem(element)
        items.push({
          key: target.key,
          side: 'to',
          element,
          rect: target.rect,
          opacity: 0,
          destination: null,
        })
      }
      renderProgress(0)
    } catch (error) {
      clear()
      throw error
    }
  }

  function renderProgress(progress: number): void {
    const value = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0))
    currentViewport = {
      left: viewportFrom.left + (viewportTo.left - viewportFrom.left) * value,
      top: viewportFrom.top + (viewportTo.top - viewportFrom.top) * value,
      width: viewportFrom.width + (viewportTo.width - viewportFrom.width) * value,
      height: viewportFrom.height + (viewportTo.height - viewportFrom.height) * value,
    }
    host.renderViewport(currentViewport, viewportUnion)

    for (const item of items) {
      if (item.side === 'from') {
        const destination = item.destination
        const dx = destination ? destination.left - item.rect.left : 0
        const dy = destination ? destination.top - item.rect.top : 0
        const targetScale =
          destination && item.rect.width > 0 ? destination.width / item.rect.width : 1
        const scale = 1 + (targetScale - 1) * value
        host.renderItem(
          item.element,
          `translate3d(${dx * value}px, ${dy * value}px, 0) scale(${scale})`,
          destination ? item.opacity : item.opacity * (1 - value),
        )
      } else {
        host.renderItem(item.element, 'translate3d(0, 0, 0)', value)
      }
    }
  }

  function captureVisuals(): AlbumTransitionVisual[] {
    const seen = new Set<string>()
    return items.flatMap((item) => {
      if (seen.has(item.key) || !host.isConnected(item.element)) return []
      const visual = host.captureItem(item.element)
      if (!visual || visual.rect.width <= 0 || visual.rect.height <= 0) return []
      if (!Number.isFinite(visual.opacity) || visual.opacity <= 0.001) return []
      seen.add(item.key)
      return [{ ...visual, key: item.key, snapshotOwned: true }]
    })
  }

  function captureViewport(): AlbumTransitionRect {
    return { ...currentViewport }
  }

  function getItemStats(): { registeredItems: number; connectedItems: number } {
    return {
      registeredItems: items.length,
      connectedItems: items.filter((item) => host.isConnected(item.element)).length,
    }
  }

  return {
    prepareSources,
    commitTargets,
    renderProgress,
    captureVisuals,
    captureViewport,
    getItemStats,
    clear,
  }
}
