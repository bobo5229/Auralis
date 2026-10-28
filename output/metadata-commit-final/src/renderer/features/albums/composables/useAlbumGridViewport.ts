import { computed, nextTick, watch, type Ref } from 'vue'
import { observeElementOffset, observeElementRect, useVirtualizer } from '@tanstack/vue-virtual'
import { prefetchArtworkPalette } from '@renderer/features/playback/composables/useArtworkPalette'
import type { AlbumSummary } from '../types'

export function useAlbumGridViewport({
  albums,
  scrollRef,
  isPageActive,
  canRefresh,
  columnCount,
  rowHeight,
  updateAdaptiveGrid,
}: {
  albums: Readonly<Ref<AlbumSummary[]>>
  scrollRef: Ref<HTMLElement | null>
  isPageActive: Readonly<Ref<boolean>>
  canRefresh: Readonly<Ref<boolean>>
  columnCount: Readonly<Ref<number>>
  rowHeight: Readonly<Ref<number>>
  updateAdaptiveGrid: (animate?: boolean) => boolean
}) {
  const ALBUMS_SCROLL_TOP_KEY = 'auralis-albums-scroll-top'

  let resizeObserver: ResizeObserver | null = null

  let gridConnectionRevision = 0

  let isPageUnmounted = false

  let savedScrollTop = Number(sessionStorage.getItem(ALBUMS_SCROLL_TOP_KEY)) || 0

  let idlePalettePrefetchHandle: number | null = null

  let idlePalettePrefetchMode: 'idle' | 'timeout' | null = null

  function cancelIdlePalettePrefetch(): void {
    if (idlePalettePrefetchHandle == null) return
    if (idlePalettePrefetchMode === 'idle') window.cancelIdleCallback(idlePalettePrefetchHandle)
    else window.clearTimeout(idlePalettePrefetchHandle)
    idlePalettePrefetchHandle = null
    idlePalettePrefetchMode = null
  }

  function prefetchVisibleAlbumPalettes(): void {
    idlePalettePrefetchHandle = null
    idlePalettePrefetchMode = null
    if (isPageUnmounted || !canRefresh.value) return
    for (const virtualRow of rowVirtualizer.value.getVirtualItems()) {
      const row = albumRows.value[virtualRow.index]
      if (!row) continue
      for (const album of row) prefetchArtworkPalette(album.artworkCacheKey)
    }
  }

  function scheduleIdlePalettePrefetch(): void {
    cancelIdlePalettePrefetch()
    if (!canRefresh.value) return
    if (typeof window.requestIdleCallback === 'function') {
      idlePalettePrefetchMode = 'idle'
      idlePalettePrefetchHandle = window.requestIdleCallback(prefetchVisibleAlbumPalettes, {
        timeout: 1500,
      })
      return
    }
    idlePalettePrefetchMode = 'timeout'
    idlePalettePrefetchHandle = window.setTimeout(prefetchVisibleAlbumPalettes, 200)
  }

  const albumRows = computed(() => {
    const cols = columnCount.value
    const rows: AlbumSummary[][] = []
    for (let index = 0; index < albums.value.length; index += cols) {
      rows.push(albums.value.slice(index, index + cols))
    }
    return rows
  })

  const rowVirtualizer = useVirtualizer<HTMLElement, HTMLElement>(
    computed(() => ({
      count: albumRows.value.length,
      getScrollElement: () => scrollRef.value,
      estimateSize: () => rowHeight.value,
      overscan: 2,
      // KeepAlive moves this element to a detached tree. Ignore its zero geometry
      // and scroll resets so cached rows survive the complete leave/enter motion.
      observeElementRect: (instance, callback) =>
        observeElementRect(instance, (rect) => {
          if (instance.scrollElement?.isConnected && rect.width > 0 && rect.height > 0)
            callback(rect)
        }),
      observeElementOffset: (instance, callback) =>
        observeElementOffset(instance, (offset, scrolling) => {
          if (instance.scrollElement?.isConnected) callback(offset, scrolling)
        }),
    })),
  )

  const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())

  const totalHeight = computed(() => rowVirtualizer.value.getTotalSize())

  async function connectGrid(): Promise<void> {
    const revision = ++gridConnectionRevision
    resizeObserver?.disconnect()
    resizeObserver = null
    const container = scrollRef.value
    if (!container?.isConnected || !isPageActive.value) return
    // A resize while hidden can change total height. Commit that geometry before
    // restoring the offset, without waiting for another animation frame.
    if (updateAdaptiveGrid(false)) await nextTick()
    if (
      revision !== gridConnectionRevision ||
      isPageUnmounted ||
      !isPageActive.value ||
      scrollRef.value !== container ||
      !container.isConnected
    )
      return
    resizeObserver = new ResizeObserver(() => {
      if (revision === gridConnectionRevision && scrollRef.value === container) updateAdaptiveGrid()
    })
    resizeObserver.observe(container)
    // Activation hooks run before paint; no next-frame jump during the transition.
    if (Number.isFinite(savedScrollTop)) container.scrollTop = savedScrollTop
    scheduleIdlePalettePrefetch()
  }

  // The v-if can create a new container after an already-loaded empty catalog.
  // Reconnect only for a new element or activation, never for a background refresh.
  watch(
    scrollRef,
    (_container, previous) => {
      if (previous && isPageActive.value) savedScrollTop = previous.scrollTop
      void connectGrid()
    },
    { flush: 'post' },
  )

  watch(canRefresh, (allowed) => {
    if (allowed) scheduleIdlePalettePrefetch()
    else cancelIdlePalettePrefetch()
  })
  function rememberScroll() {
    if (scrollRef.value) savedScrollTop = scrollRef.value.scrollTop
  }
  function persistScroll() {
    sessionStorage.setItem(ALBUMS_SCROLL_TOP_KEY, String(savedScrollTop))
  }
  function disconnect() {
    gridConnectionRevision += 1
    resizeObserver?.disconnect()
    resizeObserver = null
    cancelIdlePalettePrefetch()
  }
  function dispose() {
    isPageUnmounted = true
    if (isPageActive.value) rememberScroll()
    disconnect()
    persistScroll()
  }
  return {
    albumRows,
    rowVirtualizer,
    virtualRows,
    totalHeight,
    connectGrid,
    rememberScroll,
    persistScroll,
    disconnect,
    dispose,
  }
}
