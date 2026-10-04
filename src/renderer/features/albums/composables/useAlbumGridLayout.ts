import { nextTick, onScopeDispose, ref, watch, type Ref } from 'vue'

/** 与 .albums-grid-row 的左右阴影缓冲 padding 之和保持一致。 */
export const GRID_PADDING_X = 40
export const COLUMN_GAP = 20
/** 封面下方固定元信息区：12px margin + 58px 文本块。 */
const CARD_METADATA_HEIGHT = 70
const ROW_GAP = 28
const TARGET_CARD_WIDTH = 190
const MAX_CARD_WIDTH = 210
const MIN_COLS = 3
const MAX_COLS = 6

export interface AlbumGridGeometry {
  width: number
  columnCount: number
  cardWidth: number
  rowHeight: number
  totalHeight: number
}

export interface AlbumGridGeometryResult {
  geometry: AlbumGridGeometry
  nextScrollTop: number
  anchorAlbumKey: string | null
}

/**
 * Pure geometry calculation shared by resize commits and the lyrics transition.
 * All scroll values are CSS pixels in the scroll element's coordinate space.
 */
export function calculateAlbumGridGeometry(input: {
  width: number
  viewportHeight: number
  paddingTop: number
  paddingBottom: number
  albumKeys: readonly string[]
  previous: AlbumGridGeometry | null
  scrollTop: number
  anchorAlbumKey: string | null
}): AlbumGridGeometryResult {
  const availableWidth = Math.max(0, input.width - GRID_PADDING_X)
  let columnCount = Math.floor((availableWidth + COLUMN_GAP) / (TARGET_CARD_WIDTH + COLUMN_GAP))
  columnCount = Math.min(MAX_COLS, Math.max(MIN_COLS, columnCount))
  let cardWidth = Math.max(1, (availableWidth - COLUMN_GAP * (columnCount - 1)) / columnCount)
  while (columnCount < MAX_COLS && cardWidth > MAX_CARD_WIDTH) {
    columnCount += 1
    cardWidth = Math.max(1, (availableWidth - COLUMN_GAP * (columnCount - 1)) / columnCount)
  }

  const rowHeight = cardWidth + CARD_METADATA_HEIGHT + ROW_GAP
  const totalHeight = Math.ceil(input.albumKeys.length / columnCount) * rowHeight
  const geometry = { width: input.width, columnCount, cardWidth, rowHeight, totalHeight }

  if (!input.previous || input.albumKeys.length === 0) {
    return {
      geometry,
      nextScrollTop: input.scrollTop,
      anchorAlbumKey: null,
    }
  }

  const contentOffset = Math.max(0, input.scrollTop - input.paddingTop)
  const oldRow = Math.floor(contentOffset / input.previous.rowHeight)
  const preservedIndex = input.anchorAlbumKey ? input.albumKeys.indexOf(input.anchorAlbumKey) : -1
  const anchorIndex =
    preservedIndex >= 0 && Math.floor(preservedIndex / input.previous.columnCount) === oldRow
      ? preservedIndex
      : oldRow * input.previous.columnCount
  const anchorAlbumKey = input.albumKeys[anchorIndex] ?? null
  const offsetInRow = Math.max(0, contentOffset - oldRow * input.previous.rowHeight)
  const mappedScrollTop =
    input.scrollTop <= input.paddingTop
      ? input.scrollTop
      : input.paddingTop +
        Math.floor(anchorIndex / columnCount) * rowHeight +
        Math.min(offsetInRow, rowHeight - 1)
  const maxScrollTop = Math.max(
    0,
    input.paddingTop + totalHeight + input.paddingBottom - input.viewportHeight,
  )

  return {
    geometry,
    nextScrollTop: Math.min(mappedScrollTop, maxScrollTop),
    anchorAlbumKey,
  }
}

/** Geometry commits are explicit so the transition can submit its target before motion starts. */
export function useAlbumGridLayout(options: {
  container: Ref<HTMLElement | null>
  isResizing: Readonly<Ref<boolean>>
  isActive: Readonly<Ref<boolean>>
  albumKeys: Readonly<Ref<readonly string[]>>
  measure: () => void
}) {
  const gridWidth = ref<number | null>(null)
  const columnCount = ref(4)
  const cardWidth = ref(190)
  const rowHeight = ref(240)
  const totalHeight = ref(0)
  let revision = 0
  let disposed = false
  let transitionLocked = false
  let anchorAlbumKey: string | null = null

  function update(preserveScroll = true, force = false): boolean {
    if (
      disposed ||
      !options.isActive.value ||
      (!force && (transitionLocked || options.isResizing.value))
    )
      return false
    const container = options.container.value
    if (!container?.isConnected) return false
    const width = container.clientWidth
    if (width === 0) return false

    const previous: AlbumGridGeometry | null =
      gridWidth.value === null
        ? null
        : {
            width: gridWidth.value,
            columnCount: columnCount.value,
            cardWidth: cardWidth.value,
            rowHeight: rowHeight.value,
            totalHeight: totalHeight.value,
          }
    const style = getComputedStyle(container)
    const result = calculateAlbumGridGeometry({
      width,
      viewportHeight: container.clientHeight,
      paddingTop: Number.parseFloat(style.paddingTop) || 0,
      paddingBottom: Number.parseFloat(style.paddingBottom) || 0,
      albumKeys: options.albumKeys.value,
      previous,
      scrollTop: container.scrollTop,
      anchorAlbumKey,
    })
    const next = result.geometry
    if (
      previous &&
      previous.width === next.width &&
      previous.columnCount === next.columnCount &&
      previous.cardWidth === next.cardWidth &&
      previous.rowHeight === next.rowHeight &&
      previous.totalHeight === next.totalHeight
    ) {
      return false
    }

    gridWidth.value = next.width
    columnCount.value = next.columnCount
    cardWidth.value = next.cardWidth
    rowHeight.value = next.rowHeight
    totalHeight.value = next.totalHeight
    anchorAlbumKey = preserveScroll ? result.anchorAlbumKey : null
    options.measure()

    const currentRevision = ++revision
    if (preserveScroll) {
      // Restore after Vue patches the new virtual row count and total scroll height.
      void nextTick(() => {
        if (
          currentRevision === revision &&
          options.isActive.value &&
          (force || (!options.isResizing.value && !transitionLocked)) &&
          options.container.value === container &&
          container.isConnected
        ) {
          container.scrollTop = result.nextScrollTop
        }
      })
    }
    return true
  }

  function beginTransition(): void {
    transitionLocked = true
  }

  function commitTransitionTarget(): boolean {
    return update(true, true)
  }

  function endTransition(): void {
    transitionLocked = false
    void nextTick(() => update())
  }

  watch(options.isResizing, (resizing) => {
    if (!resizing) void nextTick(() => update())
  })
  // KeepAlive can reactivate the same element before a queued restore runs.
  watch(
    options.isActive,
    (active) => {
      if (!active) revision += 1
    },
    { flush: 'sync' },
  )
  watch(
    options.container,
    () => {
      revision += 1
    },
    { flush: 'sync' },
  )
  onScopeDispose(() => {
    disposed = true
    transitionLocked = false
    revision += 1
  })
  return {
    gridWidth,
    columnCount,
    cardWidth,
    rowHeight,
    totalHeight,
    update,
    beginTransition,
    commitTransitionTarget,
    endTransition,
  }
}
