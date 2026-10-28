import { nextTick, ref, type Ref } from 'vue'
import type { AlbumLayoutTransitionParticipant } from '@renderer/shared/animation/albumLayoutTransition'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import type AlbumGridTransitionLayer from '../components/AlbumGridTransitionLayer.vue'
import type { useAlbumGridLayout } from './useAlbumGridLayout'
import type {
  AlbumTransitionRect,
  AlbumTransitionTarget,
  AlbumTransitionVisual,
} from '../utils/albumGridTransitionController'
import { findAlbumTransitionFocusTarget } from '../utils/albumGridTransitionPlan'
import { calculateAlbumTransitionRect } from '../utils/albumGridTransitionGeometry'

type TransitionLayer = Pick<
  InstanceType<typeof AlbumGridTransitionLayer>,
  'prepareSources' | 'commitTargets' | 'animate' | 'captureVisuals' | 'captureViewport' | 'clear'
>
interface AlbumLayoutTransitionOptions {
  container: Readonly<Ref<HTMLElement | null>>
  layer: Readonly<Ref<TransitionLayer | null>>
  isPageActive: Readonly<Ref<boolean>>
  grid: Pick<
    ReturnType<typeof useAlbumGridLayout>,
    'gridWidth' | 'columnCount' | 'beginTransition' | 'commitTransitionTarget' | 'endTransition'
  >
  getVirtualRows(): readonly { index: number; start: number; size: number }[]
  cancelDrop(): void
  requestCancel(): void
}

/** AlbumsPage's participant in the shell-owned lyrics/sidebar layout transition. */
export function useAlbumLayoutTransition({
  container: scrollRef,
  layer: transitionLayerRef,
  isPageActive,
  grid,
  getVirtualRows,
  cancelDrop,
  requestCancel,
}: AlbumLayoutTransitionOptions) {
  const {
    gridWidth,
    columnCount,
    beginTransition: beginGridTransition,
    commitTransitionTarget: commitGridTransitionTarget,
    endTransition: endGridTransition,
  } = grid
  const isLayoutTransitionActive = ref(false)
  let layoutTransitionRevision = 0
  let savedFocus: { albumKey: string; selector: string } | null = null
  let pendingTransitionScrollTop: number | null = null

  function toTransitionRect(rect: DOMRect): AlbumTransitionRect {
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  }

  function measureScrollViewport(container: HTMLElement): DOMRect {
    const rect = container.getBoundingClientRect()
    return DOMRect.fromRect({
      x: rect.left + container.clientLeft,
      y: rect.top + container.clientTop,
      width: container.clientWidth,
      height: container.clientHeight,
    })
  }

  function isInsideViewport(rect: DOMRect, viewport: DOMRect): boolean {
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.right > viewport.left &&
      rect.left < viewport.right &&
      rect.bottom > viewport.top &&
      rect.top < viewport.bottom
    )
  }

  function collectVisibleTransitionVisuals(
    viewport = scrollRef.value ? measureScrollViewport(scrollRef.value) : undefined,
  ): AlbumTransitionVisual[] {
    const container = scrollRef.value
    if (!container || !viewport) return []
    return Array.from(
      container.querySelectorAll<HTMLElement>('.album-card[data-album-key]'),
    ).flatMap((card) => {
      const rect = card.getBoundingClientRect()
      if (!isInsideViewport(rect, viewport)) return []
      const key = card.dataset.albumKey
      if (!key) return []
      const opacity = Number.parseFloat(getComputedStyle(card).opacity)
      return [
        {
          key,
          node: card,
          rect: toTransitionRect(rect),
          opacity: Number.isFinite(opacity) ? opacity : 1,
        },
      ]
    })
  }

  function collectVisibleTransitionTargets(
    viewport = scrollRef.value ? measureScrollViewport(scrollRef.value) : undefined,
  ): AlbumTransitionTarget[] {
    const container = scrollRef.value
    if (!container || !viewport) return []
    const paddingTop = Number.parseFloat(getComputedStyle(container).paddingTop) || 0
    const scrollTop = container.scrollTop
    const rowsByIndex = new Map(getVirtualRows().map((row) => [row.index, row]))
    const targets: AlbumTransitionTarget[] = []
    for (const rowElement of container.querySelectorAll<HTMLElement>('.albums-grid-row')) {
      const row = rowsByIndex.get(Number(rowElement.dataset.rowIndex))
      if (!row) continue
      Array.from(rowElement.querySelectorAll<HTMLElement>('.album-card[data-album-key]')).forEach(
        (card, columnIndex) => {
          const key = card.dataset.albumKey
          if (!key) return
          const rect = calculateAlbumTransitionRect({
            viewport,
            gridWidth: gridWidth.value ?? viewport.width,
            columnCount: columnCount.value,
            columnIndex,
            rowStart: row.start,
            rowHeight: row.size,
            paddingTop,
            scrollTop,
          })
          if (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.left < viewport.right &&
            rect.left + rect.width > viewport.left &&
            rect.top < viewport.bottom &&
            rect.top + rect.height > viewport.top
          )
            targets.push({ key, node: card, rect })
        },
      )
    }
    return targets
  }

  function removeTransitionInputListeners(): void {
    pendingTransitionScrollTop = null
    document.removeEventListener('keydown', onTransitionKeydown, true)
    scrollRef.value?.removeEventListener('wheel', onTransitionWheel)
    scrollRef.value?.removeEventListener('touchstart', onTransitionTouchStart)
    scrollRef.value?.removeEventListener('scroll', onTransitionScroll)
  }

  function onTransitionKeydown(event: KeyboardEvent): void {
    const target = event.target
    if (
      (event.key === 'Enter' || event.key === ' ') &&
      target instanceof Element &&
      target.closest('[data-lyrics-toggle], [data-sidebar-toggle]')
    )
      return
    if (
      [
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Home',
        'End',
        'PageUp',
        'PageDown',
        'Tab',
        'Enter',
        ' ',
      ].includes(event.key)
    ) {
      requestCancel()
    }
  }

  function onTransitionWheel(): void {
    requestCancel()
  }

  function onTransitionTouchStart(): void {
    requestCancel()
  }

  function onTransitionScroll(): void {
    if (
      pendingTransitionScrollTop !== null &&
      Math.abs((scrollRef.value?.scrollTop ?? 0) - pendingTransitionScrollTop) < 1
    ) {
      pendingTransitionScrollTop = null
      return
    }
    requestCancel()
  }

  function prepareLyricsLayoutTransition(revision: number): boolean {
    cancelDrop()
    const container = scrollRef.value
    const layer = transitionLayerRef.value
    if (!isPageActive.value || !container?.isConnected || !layer) return false
    const reversing = isLayoutTransitionActive.value
    let gridTransitionBegun = false
    try {
      const viewport = measureScrollViewport(container)
      let fromViewport = toTransitionRect(viewport)
      let sources: AlbumTransitionVisual[]
      if (reversing) {
        fromViewport = layer.captureViewport()
        sources = layer.captureVisuals()
      } else {
        const activeElement = document.activeElement
        if (activeElement instanceof HTMLElement) {
          const card = activeElement.closest<HTMLElement>('.album-card[data-album-key]')
          if (card?.dataset.albumKey) {
            savedFocus = {
              albumKey: card.dataset.albumKey,
              selector: activeElement.classList.contains('cover-stage')
                ? '.cover-stage'
                : activeElement.classList.contains('album-card-play')
                  ? '.album-card-play'
                  : '.cover-stage',
            }
          }
        }
        sources = collectVisibleTransitionVisuals(viewport)
        beginGridTransition()
        gridTransitionBegun = true
      }

      layoutTransitionRevision = revision
      isLayoutTransitionActive.value = true
      layer.prepareSources(fromViewport, sources)
    } catch (error) {
      layer.clear()
      isLayoutTransitionActive.value = false
      savedFocus = null
      removeTransitionInputListeners()
      if (reversing || gridTransitionBegun) endGridTransition()
      rendererDiagnostics.error({
        scope: 'albums.transition',
        message: 'Failed to prepare album layout transition',
        cause: error,
      })
      return false
    }
    document.addEventListener('keydown', onTransitionKeydown, true)
    container.addEventListener('wheel', onTransitionWheel, { passive: true })
    container.addEventListener('touchstart', onTransitionTouchStart, { passive: true })
    container.addEventListener('scroll', onTransitionScroll, { passive: true })
    return true
  }

  async function commitLyricsLayoutTransition(revision: number): Promise<boolean> {
    const container = scrollRef.value
    const layer = transitionLayerRef.value
    if (
      revision !== layoutTransitionRevision ||
      !isLayoutTransitionActive.value ||
      !isPageActive.value ||
      !container?.isConnected ||
      !layer
    )
      return false

    try {
      commitGridTransitionTarget()
      await nextTick()
      if (
        revision !== layoutTransitionRevision ||
        !isLayoutTransitionActive.value ||
        !isPageActive.value ||
        scrollRef.value !== container ||
        !container.isConnected ||
        transitionLayerRef.value !== layer
      )
        return false
      pendingTransitionScrollTop = container.scrollTop

      // The remapped scroll event updates TanStack's visible range at the rendering
      // boundary, after Vue's geometry patch. Capture targets only after that update.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      await nextTick()
      if (
        revision !== layoutTransitionRevision ||
        !isLayoutTransitionActive.value ||
        !isPageActive.value ||
        !container.isConnected ||
        transitionLayerRef.value !== layer
      )
        return false
      const viewport = measureScrollViewport(container)
      layer.commitTargets(toTransitionRect(viewport), collectVisibleTransitionTargets(viewport))
      return true
    } catch (error) {
      layer.clear()
      rendererDiagnostics.error({
        scope: 'albums.transition',
        message: 'Failed to commit album layout transition',
        cause: error,
      })
      return false
    }
  }

  async function animateLyricsLayoutTransition(revision: number, duration: number): Promise<void> {
    if (revision === layoutTransitionRevision) await transitionLayerRef.value?.animate(duration)
  }

  async function finishLyricsLayoutTransition(revision: number): Promise<void> {
    if (revision !== layoutTransitionRevision) return
    const container = scrollRef.value
    transitionLayerRef.value?.clear()
    isLayoutTransitionActive.value = false
    removeTransitionInputListeners()
    endGridTransition()
    const focus = savedFocus
    savedFocus = null
    await nextTick()
    if (!focus || !isPageActive.value || !container?.isConnected) return
    findAlbumTransitionFocusTarget(
      container.querySelectorAll<HTMLElement>('.album-card[data-album-key]'),
      focus.albumKey,
      focus.selector,
    )?.focus()
  }

  function cancelLyricsLayoutTransition(revision: number): void {
    if (revision !== layoutTransitionRevision) return
    transitionLayerRef.value?.clear()
    savedFocus = null
    isLayoutTransitionActive.value = false
    removeTransitionInputListeners()
    endGridTransition()
  }

  const participant: AlbumLayoutTransitionParticipant = {
    prepareLyricsLayoutTransition,
    commitLyricsLayoutTransition,
    animateLyricsLayoutTransition,
    finishLyricsLayoutTransition,
    cancelLyricsLayoutTransition,
  }
  // The page calls this before disconnecting its grid on deactivation/unmount.
  return {
    isLayoutTransitionActive,
    participant,
    cancelCurrentTransition: () => cancelLyricsLayoutTransition(layoutTransitionRevision),
  }
}
