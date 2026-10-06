import { nextTick, ref, watch, type Ref } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import { LIBRARY_LAYOUT_METRICS } from '../constants/libraryLayoutMetrics'
import { getAlbumCoverTrackDiscHeadings } from '../utils/albumCoverDiscHeadings'
import { resolveFirstVisibleTrackIndex } from '../utils/libraryFirstVisibleTrack'
import {
  resolveLibraryViewportRestoreAction,
  type LibraryViewportRestore,
} from '../utils/libraryViewportRestore'
import {
  resolveNavigationScrollTop,
  type LibraryNavigationViewport,
} from '../utils/libraryNavigationViewport'

const SCROLL_POSITION_RATIO = 0.33
const COVER_TOP_INSET = LIBRARY_LAYOUT_METRICS.coverContentTopInset

export interface LibraryViewportCapture {
  restore: LibraryViewportRestore
  previousTrackIds: number[]
}

export function useLibraryViewport(options: {
  scrollRef: Ref<HTMLElement | null>
  tracks: { readonly value: readonly TrackListItem[] }
  isCoverView: { readonly value: boolean }
  derivedIndex: {
    readonly value: {
      trackIndexById: ReadonlyMap<number, number>
      albumGroupIndexByTrackId: ReadonlyMap<number, number>
      albumGroupStartOffsets: readonly number[]
      trackById: ReadonlyMap<number, TrackListItem>
    }
  }
  albumGroups: {
    readonly value: ReadonlyArray<{
      firstTrackIndex: number
      tracks: readonly Pick<TrackListItem, 'id' | 'discNo'>[]
    }>
  }
  virtualAlbumGroups: { readonly value: ReadonlyArray<{ index: number; end: number }> }
  currentTrackId: () => number | null
  selectedTrackId: () => number | null
  isDisposed: () => boolean
  flatRowHeight?: { readonly value: number }
  onViewSwitchComplete?: (targetTrackId: number) => void
}) {
  const firstVisibleTrackIndex = ref(0)
  let userScrollGeneration = 0
  let pendingViewSwitchTrackId: number | null = null
  let pendingViewSwitchScrollFrame: number | null = null
  let pendingFirstVisibleTrackFrame: number | null = null
  let flatLayoutRestoreRevision = 0
  let navigationIntentGeneration = 0
  let pendingFlatLayoutAnchor: {
    generation: number
    index: number
    trackId: number | null
    fraction: number
    atTopInset: boolean
    topScrollTop: number
  } | null = null

  function currentFlatRowHeight(): number {
    const candidate = options.flatRowHeight?.value ?? LIBRARY_LAYOUT_METRICS.flatRowHeight
    return Number.isFinite(candidate) && candidate > 0
      ? candidate
      : LIBRARY_LAYOUT_METRICS.flatRowHeight
  }

  function captureScrollGeneration(): number {
    return userScrollGeneration
  }

  function isScrollInputCancelled(startGeneration: number): boolean {
    return userScrollGeneration !== startGeneration
  }

  function invalidatePendingFlatLayoutRestore(): void {
    flatLayoutRestoreRevision++
    pendingFlatLayoutAnchor = null
  }

  function onUserScrollInput(): void {
    userScrollGeneration++
    navigationIntentGeneration++
    invalidatePendingFlatLayoutRestore()
  }

  function onViewportKeyDown(event: KeyboardEvent): void {
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
      onUserScrollInput()
    }
  }

  function cancelNavigationRestore(): void {
    navigationIntentGeneration++
    invalidatePendingFlatLayoutRestore()
  }

  function captureNavigationIntent(): number {
    return navigationIntentGeneration
  }

  function trackGeometry(trackId: number): { top: number; height: number } | null {
    const index = options.derivedIndex.value.trackIndexById.get(trackId)
    if (index === undefined) return null
    if (!options.isCoverView.value) {
      return {
        top:
          LIBRARY_LAYOUT_METRICS.flatHeaderHeight +
          LIBRARY_LAYOUT_METRICS.flatRowsInset +
          index * currentFlatRowHeight(),
        height: currentFlatRowHeight(),
      }
    }
    const groupIndex = options.derivedIndex.value.albumGroupIndexByTrackId.get(trackId)
    if (groupIndex === undefined) return null
    const group = options.albumGroups.value[groupIndex]
    const groupOffset = options.derivedIndex.value.albumGroupStartOffsets[groupIndex]
    if (!group || groupOffset === undefined) return null
    const rowIndex = group.tracks.findIndex((track) => track.id === trackId)
    if (rowIndex < 0) return null
    const headings = getAlbumCoverTrackDiscHeadings(group.tracks)
      .slice(1, rowIndex + 1)
      .filter((disc) => disc !== null).length
    return {
      top:
        groupOffset +
        COVER_TOP_INSET +
        LIBRARY_LAYOUT_METRICS.coverGroupPaddingBlockSide +
        LIBRARY_LAYOUT_METRICS.coverPanelBorderWidth +
        LIBRARY_LAYOUT_METRICS.coverPanelPaddingBlockSide +
        rowIndex * LIBRARY_LAYOUT_METRICS.coverTrackRowHeight +
        headings * LIBRARY_LAYOUT_METRICS.coverDiscHeadingHeight,
      height: LIBRARY_LAYOUT_METRICS.coverTrackRowHeight,
    }
  }

  function captureNavigationViewport(): LibraryNavigationViewport | null {
    const container = options.scrollRef.value
    if (
      !container?.isConnected ||
      container.clientHeight <= 0 ||
      options.tracks.value.length === 0
    ) {
      return null
    }
    const headerHeight = options.isCoverView.value ? 0 : LIBRARY_LAYOUT_METRICS.flatHeaderHeight
    const visibleTop = container.scrollTop + headerHeight
    let index = Math.max(
      0,
      Math.min(
        options.tracks.value.length - 1,
        Math.floor(
          (container.scrollTop - LIBRARY_LAYOUT_METRICS.flatRowsInset) / currentFlatRowHeight(),
        ),
      ),
    )
    let coverAnchor: { groupIndex: number; rowIndex: number } | null = null
    if (options.isCoverView.value) {
      const starts = options.derivedIndex.value.albumGroupStartOffsets
      let groupIndex = 0
      // Locate the group from the complete index, independent of mounted overscan rows.
      let low = 0
      let high = starts.length - 1
      while (low <= high) {
        const middle = (low + high) >>> 1
        if (starts[middle] + COVER_TOP_INSET <= container.scrollTop) {
          groupIndex = middle
          low = middle + 1
        } else high = middle - 1
      }
      const group = options.albumGroups.value[groupIndex]
      if (!group?.tracks.length) return null
      index = group.firstTrackIndex
      const headings = getAlbumCoverTrackDiscHeadings(group.tracks)
      let top =
        starts[groupIndex] +
        COVER_TOP_INSET +
        LIBRARY_LAYOUT_METRICS.coverGroupPaddingBlockSide +
        LIBRARY_LAYOUT_METRICS.coverPanelBorderWidth +
        LIBRARY_LAYOUT_METRICS.coverPanelPaddingBlockSide
      for (let row = 0; row < group.tracks.length; row++) {
        if (row > 0 && headings[row] !== null) top += LIBRARY_LAYOUT_METRICS.coverDiscHeadingHeight
        index =
          options.derivedIndex.value.trackIndexById.get(group.tracks[row].id) ??
          group.firstTrackIndex
        coverAnchor = { groupIndex, rowIndex: row }
        if (top + LIBRARY_LAYOUT_METRICS.coverTrackRowHeight > visibleTop) break
        top += LIBRARY_LAYOUT_METRICS.coverTrackRowHeight
      }
    }
    const anchorTrackId = options.tracks.value[index].id
    const geometry = trackGeometry(anchorTrackId)
    if (!geometry) return null
    const anchorTrackIds = [anchorTrackId]
    // A bounded neighborhood provides a nearby fallback without retaining the library.
    for (let distance = 1; distance <= 3; distance++) {
      for (const direction of [1, -1]) {
        if (coverAnchor) {
          let groupIndex = coverAnchor.groupIndex
          let rowIndex = coverAnchor.rowIndex + direction * distance
          const groups = options.albumGroups.value
          while (groupIndex < groups.length && rowIndex >= groups[groupIndex].tracks.length) {
            rowIndex -= groups[groupIndex].tracks.length
            groupIndex++
          }
          while (groupIndex >= 0 && rowIndex < 0) {
            groupIndex--
            if (groupIndex >= 0) rowIndex += groups[groupIndex].tracks.length
          }
          const track = groups[groupIndex]?.tracks[rowIndex]
          if (track) anchorTrackIds.push(track.id)
        } else {
          const track = options.tracks.value[index + direction * distance]
          if (track) anchorTrackIds.push(track.id)
        }
      }
    }
    return {
      scrollTop: container.scrollTop,
      viewMode: options.isCoverView.value ? 'cover' : 'flat',
      anchorTrackIds,
      anchorOffset: visibleTop - geometry.top,
      anchorRowHeight: geometry.height,
    }
  }

  function restoreNavigationViewport(
    saved: LibraryNavigationViewport,
    intent: number,
    isRequestCurrent: () => boolean,
  ): boolean {
    if (intent !== navigationIntentGeneration || options.isDisposed() || !isRequestCurrent())
      return false
    const container = options.scrollRef.value
    if (!container?.isConnected || container.clientHeight <= 0 || options.tracks.value.length === 0)
      return false
    invalidatePendingFlatLayoutRestore()
    let anchor: { top: number; height: number } | null = null
    for (const trackId of saved.anchorTrackIds) {
      anchor = trackGeometry(trackId)
      if (anchor) break
    }
    container.scrollTop = resolveNavigationScrollTop(saved, {
      viewMode: options.isCoverView.value ? 'cover' : 'flat',
      anchorTop: anchor?.top ?? null,
      rowHeight: anchor?.height ?? currentFlatRowHeight(),
      headerHeight: options.isCoverView.value ? 0 : LIBRARY_LAYOUT_METRICS.flatHeaderHeight,
      maxScrollTop: Math.max(0, container.scrollHeight - container.clientHeight),
    })
    scheduleFirstVisibleTrackIndexUpdate()
    return true
  }

  function updateFirstVisibleTrackIndex(): void {
    // The flat sticky heading contributes equally to the viewport top and row
    // origin, so its height cancels out; only the gap below it remains here.
    const container = options.scrollRef.value
    if (!container) return

    const nextIndex = resolveFirstVisibleTrackIndex({
      scrollTop: container.scrollTop,
      topInset: options.isCoverView.value ? COVER_TOP_INSET : LIBRARY_LAYOUT_METRICS.flatRowsInset,
      isCoverView: options.isCoverView.value,
      flatRowHeight: currentFlatRowHeight(),
      trackCount: options.tracks.value.length,
      virtualAlbumGroups: options.virtualAlbumGroups.value,
      albumGroups: options.albumGroups.value,
    })
    if (nextIndex !== firstVisibleTrackIndex.value) {
      firstVisibleTrackIndex.value = nextIndex
    }
  }

  function scheduleFirstVisibleTrackIndexUpdate(): void {
    if (options.isDisposed() || pendingFirstVisibleTrackFrame !== null) return

    pendingFirstVisibleTrackFrame = window.requestAnimationFrame(() => {
      pendingFirstVisibleTrackFrame = null
      if (options.isDisposed()) return
      updateFirstVisibleTrackIndex()
    })
  }

  function onScroll(): void {
    scheduleFirstVisibleTrackIndexUpdate()
  }

  function scrollRenderedTrackToRatio(targetTrackId: number): boolean {
    invalidatePendingFlatLayoutRestore()
    const container = options.scrollRef.value
    if (!container) return false

    if (options.isCoverView.value) {
      const targetGroupIndex =
        options.derivedIndex.value.albumGroupIndexByTrackId.get(targetTrackId)
      if (targetGroupIndex === undefined) return false

      const targetOffset = options.derivedIndex.value.albumGroupStartOffsets[targetGroupIndex]
      if (targetOffset === undefined) return false

      container.scrollTop = Math.max(
        0,
        targetOffset + COVER_TOP_INSET - container.clientHeight * SCROLL_POSITION_RATIO,
      )
      scheduleFirstVisibleTrackIndexUpdate()
      return true
    }

    const targetIndex = options.derivedIndex.value.trackIndexById.get(targetTrackId)
    if (targetIndex === undefined) return false

    const headerHeight = LIBRARY_LAYOUT_METRICS.flatHeaderHeight
    const targetRowTop =
      targetIndex * currentFlatRowHeight() + headerHeight + LIBRARY_LAYOUT_METRICS.flatRowsInset
    const visibleViewportHeight = Math.max(0, container.clientHeight - headerHeight)
    const targetViewportTop = headerHeight + visibleViewportHeight * SCROLL_POSITION_RATIO
    container.scrollTop = Math.max(0, targetRowTop - targetViewportTop)
    scheduleFirstVisibleTrackIndexUpdate()
    return true
  }

  function scrollSearchResultTrackToRatio(targetTrackId: number): boolean {
    invalidatePendingFlatLayoutRestore()
    const container = options.scrollRef.value
    if (!container) return false
    if (!options.isCoverView.value) return scrollRenderedTrackToRatio(targetTrackId)

    const geometry = trackGeometry(targetTrackId)
    if (!geometry) return false
    container.scrollTop = Math.max(0, geometry.top - container.clientHeight * SCROLL_POSITION_RATIO)
    scheduleFirstVisibleTrackIndexUpdate()
    return true
  }

  function scrollRenderedTrackToTop(targetTrackId: number): boolean {
    invalidatePendingFlatLayoutRestore()
    const container = options.scrollRef.value
    if (!container) return false

    if (options.isCoverView.value) {
      const targetGroupIndex =
        options.derivedIndex.value.albumGroupIndexByTrackId.get(targetTrackId)
      if (targetGroupIndex === undefined) return false

      const targetOffset = options.derivedIndex.value.albumGroupStartOffsets[targetGroupIndex]
      if (targetOffset === undefined) return false

      container.scrollTop = Math.max(0, targetOffset + COVER_TOP_INSET)
      scheduleFirstVisibleTrackIndexUpdate()
      return true
    }

    const targetIndex = options.derivedIndex.value.trackIndexById.get(targetTrackId)
    if (targetIndex === undefined) return false

    container.scrollTop = Math.max(
      0,
      targetIndex * currentFlatRowHeight() + LIBRARY_LAYOUT_METRICS.flatRowsInset,
    )
    scheduleFirstVisibleTrackIndexUpdate()
    return true
  }

  async function preserveFlatScrollAnchorForRowHeight(
    previousHeight: number,
    nextHeight: number,
  ): Promise<void> {
    const container = options.scrollRef.value
    if (
      !container ||
      options.isCoverView.value ||
      options.isDisposed() ||
      !Number.isFinite(previousHeight) ||
      !Number.isFinite(nextHeight) ||
      previousHeight <= 0 ||
      nextHeight <= 0 ||
      previousHeight === nextHeight ||
      options.tracks.value.length === 0
    ) {
      return
    }

    const anchorGeneration = userScrollGeneration
    const inset = LIBRARY_LAYOUT_METRICS.flatRowsInset
    let anchor = pendingFlatLayoutAnchor
    if (!anchor || anchor.generation !== anchorGeneration) {
      const oldOffset = Math.max(0, container.scrollTop - inset)
      const anchorIndex = Math.max(
        0,
        Math.min(options.tracks.value.length - 1, Math.floor(oldOffset / previousHeight)),
      )
      const trackId = options.tracks.value[anchorIndex]?.id ?? null
      const rowOffset = oldOffset - anchorIndex * previousHeight
      anchor = {
        generation: anchorGeneration,
        index: anchorIndex,
        trackId,
        fraction: rowOffset / previousHeight,
        atTopInset: container.scrollTop < inset,
        topScrollTop: container.scrollTop,
      }
    }
    pendingFlatLayoutAnchor = anchor
    const revision = ++flatLayoutRestoreRevision
    await nextTick()
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))

    if (
      revision !== flatLayoutRestoreRevision ||
      userScrollGeneration !== anchor.generation ||
      options.isDisposed() ||
      options.isCoverView.value
    ) {
      return
    }

    const currentContainer = options.scrollRef.value
    if (!currentContainer) return
    const currentInset = LIBRARY_LAYOUT_METRICS.flatRowsInset
    const targetIndex =
      anchor.trackId === null
        ? anchor.index
        : (options.derivedIndex.value.trackIndexById.get(anchor.trackId) ?? anchor.index)
    currentContainer.scrollTop = anchor.atTopInset
      ? anchor.topScrollTop
      : Math.max(0, currentInset + (targetIndex + anchor.fraction) * nextHeight)
    pendingFlatLayoutAnchor = null
    scheduleFirstVisibleTrackIndexUpdate()
  }

  async function scrollToTrackById(
    targetTrackId: number,
    isRequestCurrent?: () => boolean,
    startGeneration: number = captureScrollGeneration(),
    scrollTarget: (trackId: number) => boolean = scrollRenderedTrackToRatio,
  ): Promise<void> {
    cancelNavigationRestore()
    invalidatePendingFlatLayoutRestore()
    await nextTick()
    if (isRequestCurrent && !isRequestCurrent()) return
    if (isScrollInputCancelled(startGeneration)) return
    await new Promise((resolve) => window.requestAnimationFrame(resolve))
    if (isRequestCurrent && !isRequestCurrent()) return
    if (isScrollInputCancelled(startGeneration)) return
    scrollTarget(targetTrackId)
  }

  async function scrollToTrackIndex(
    index: number,
    isRequestCurrent?: () => boolean,
  ): Promise<void> {
    const track = options.tracks.value[index]
    if (!track) return
    await scrollToTrackById(
      track.id,
      isRequestCurrent,
      captureScrollGeneration(),
      scrollSearchResultTrackToRatio,
    )
  }

  async function scrollToPlaybackTrack(isRequestCurrent?: () => boolean): Promise<void> {
    const targetTrackId = options.currentTrackId() ?? options.selectedTrackId()
    if (!targetTrackId) return
    await scrollToTrackById(targetTrackId, isRequestCurrent)
  }

  function captureLibraryViewportRestore(): LibraryViewportCapture {
    return {
      restore: {
        scrollTop: options.scrollRef.value?.scrollTop ?? 0,
        firstVisibleTrackId: options.tracks.value[firstVisibleTrackIndex.value]?.id ?? null,
        scrollGeneration: userScrollGeneration,
      },
      previousTrackIds: options.tracks.value.map((track) => track.id),
    }
  }

  async function restoreLibraryViewportRestore(
    capture: LibraryViewportCapture,
    isRequestCurrent: () => boolean,
  ): Promise<void> {
    invalidatePendingFlatLayoutRestore()
    if (!isRequestCurrent()) return

    const action = resolveLibraryViewportRestoreAction({
      captured: capture.restore,
      currentScrollGeneration: userScrollGeneration,
      previousTrackIds: capture.previousTrackIds,
      nextTrackIds: options.tracks.value.map((track) => track.id),
      hasTrack: (id) => options.derivedIndex.value.trackById.has(id),
    })

    if (action.type === 'keep-scroll-top') {
      const container = options.scrollRef.value
      if (!container) return
      container.scrollTop = action.scrollTop
      scheduleFirstVisibleTrackIndexUpdate()
      return
    }

    if (action.type === 'scroll-to-track') {
      scrollRenderedTrackToTop(action.trackId)
      scheduleFirstVisibleTrackIndexUpdate()
    }
  }

  function beginViewSwitch(anchorTrackId: number | null): void {
    cancelNavigationRestore()
    invalidatePendingFlatLayoutRestore()
    pendingViewSwitchTrackId = anchorTrackId
    if (pendingViewSwitchScrollFrame !== null) {
      window.cancelAnimationFrame(pendingViewSwitchScrollFrame)
      pendingViewSwitchScrollFrame = null
    }
  }

  function onLibraryViewEnter(): void {
    if (pendingViewSwitchTrackId === null) return

    const targetTrackId = pendingViewSwitchTrackId

    const finishViewSwitch = () => {
      options.onViewSwitchComplete?.(targetTrackId)
      pendingViewSwitchTrackId = null
    }

    if (scrollRenderedTrackToRatio(targetTrackId)) {
      finishViewSwitch()
      return
    }

    const viewSwitchGeneration = captureScrollGeneration()
    pendingViewSwitchScrollFrame = window.requestAnimationFrame(() => {
      pendingViewSwitchScrollFrame = null
      if (isScrollInputCancelled(viewSwitchGeneration)) {
        finishViewSwitch()
        return
      }
      scrollRenderedTrackToRatio(targetTrackId)
      finishViewSwitch()
    })
  }

  const stopScrollRefWatch = watch(
    () => options.scrollRef.value,
    (el, oldEl) => {
      oldEl?.removeEventListener('scroll', onScroll)
      oldEl?.removeEventListener('wheel', onUserScrollInput)
      oldEl?.removeEventListener('touchstart', onUserScrollInput)
      oldEl?.removeEventListener('pointerdown', onUserScrollInput)
      oldEl?.removeEventListener('keydown', onViewportKeyDown)
      el?.addEventListener('scroll', onScroll, { passive: true })
      el?.addEventListener('wheel', onUserScrollInput, { passive: true })
      el?.addEventListener('touchstart', onUserScrollInput, { passive: true })
      el?.addEventListener('pointerdown', onUserScrollInput, { passive: true })
      el?.addEventListener('keydown', onViewportKeyDown)
      if (el) {
        void nextTick(() => scheduleFirstVisibleTrackIndexUpdate())
      }
    },
    { immediate: true },
  )

  function dispose(): void {
    flatLayoutRestoreRevision++
    pendingFlatLayoutAnchor = null
    stopScrollRefWatch()
    options.scrollRef.value?.removeEventListener('scroll', onScroll)
    options.scrollRef.value?.removeEventListener('wheel', onUserScrollInput)
    options.scrollRef.value?.removeEventListener('touchstart', onUserScrollInput)
    options.scrollRef.value?.removeEventListener('pointerdown', onUserScrollInput)
    options.scrollRef.value?.removeEventListener('keydown', onViewportKeyDown)
    if (pendingFirstVisibleTrackFrame !== null) {
      window.cancelAnimationFrame(pendingFirstVisibleTrackFrame)
      pendingFirstVisibleTrackFrame = null
    }
    if (pendingViewSwitchScrollFrame !== null) {
      window.cancelAnimationFrame(pendingViewSwitchScrollFrame)
      pendingViewSwitchScrollFrame = null
    }
  }

  return {
    firstVisibleTrackIndex,
    captureNavigationViewport,
    restoreNavigationViewport,
    captureNavigationIntent,
    cancelNavigationRestore,
    captureScrollGeneration,
    isScrollInputCancelled,
    onUserScrollInput,
    scheduleFirstVisibleTrackIndexUpdate,
    scrollRenderedTrackToRatio,
    scrollRenderedTrackToTop,
    preserveFlatScrollAnchorForRowHeight,
    scrollToTrackById,
    scrollToTrackIndex,
    scrollToPlaybackTrack,
    captureLibraryViewportRestore,
    restoreLibraryViewportRestore,
    beginViewSwitch,
    onLibraryViewEnter,
    dispose,
  }
}
