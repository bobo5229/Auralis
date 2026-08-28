import { nextTick, ref, watch, type Ref } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import { LIBRARY_LAYOUT_METRICS } from '../constants/libraryLayoutMetrics'
import { resolveFirstVisibleTrackIndex } from '../utils/libraryFirstVisibleTrack'
import {
  resolveLibraryViewportRestoreAction,
  type LibraryViewportRestore,
} from '../utils/libraryViewportRestore'

const SCROLL_POSITION_RATIO = 0.33
const LIBRARY_TOP_INSET = 16

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
  albumGroups: { readonly value: ReadonlyArray<{ firstTrackIndex: number }> }
  virtualAlbumGroups: { readonly value: ReadonlyArray<{ index: number; end: number }> }
  currentTrackId: () => number | null
  selectedTrackId: () => number | null
  isDisposed: () => boolean
  onViewSwitchComplete?: (targetTrackId: number) => void
}) {
  const firstVisibleTrackIndex = ref(0)
  let userScrollGeneration = 0
  let pendingViewSwitchTrackId: number | null = null
  let pendingViewSwitchScrollFrame: number | null = null
  let pendingFirstVisibleTrackFrame: number | null = null

  function captureScrollGeneration(): number {
    return userScrollGeneration
  }

  function isScrollInputCancelled(startGeneration: number): boolean {
    return userScrollGeneration !== startGeneration
  }

  function onUserScrollInput(): void {
    userScrollGeneration++
  }

  function updateFirstVisibleTrackIndex(): void {
    // Both visual styles share the same virtualizer geometry, and the modern
    // viewport anchor is needed for background-refresh restore, so the first
    // visible track is tracked in modern and manuscript alike.
    const container = options.scrollRef.value
    if (!container) return

    const nextIndex = resolveFirstVisibleTrackIndex({
      scrollTop: container.scrollTop,
      topInset: LIBRARY_TOP_INSET,
      isCoverView: options.isCoverView.value,
      flatRowHeight: LIBRARY_LAYOUT_METRICS.flatRowHeight,
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
        targetOffset + LIBRARY_TOP_INSET - container.clientHeight * SCROLL_POSITION_RATIO,
      )
      scheduleFirstVisibleTrackIndexUpdate()
      return true
    }

    const targetIndex = options.derivedIndex.value.trackIndexById.get(targetTrackId)
    if (targetIndex === undefined) return false

    const offset =
      targetIndex * LIBRARY_LAYOUT_METRICS.flatRowHeight +
      LIBRARY_TOP_INSET -
      container.clientHeight * SCROLL_POSITION_RATIO
    container.scrollTop = Math.max(0, offset)
    scheduleFirstVisibleTrackIndexUpdate()
    return true
  }

  function scrollRenderedTrackToTop(targetTrackId: number): boolean {
    const container = options.scrollRef.value
    if (!container) return false

    if (options.isCoverView.value) {
      const targetGroupIndex =
        options.derivedIndex.value.albumGroupIndexByTrackId.get(targetTrackId)
      if (targetGroupIndex === undefined) return false

      const targetOffset = options.derivedIndex.value.albumGroupStartOffsets[targetGroupIndex]
      if (targetOffset === undefined) return false

      container.scrollTop = Math.max(0, targetOffset + LIBRARY_TOP_INSET)
      scheduleFirstVisibleTrackIndexUpdate()
      return true
    }

    const targetIndex = options.derivedIndex.value.trackIndexById.get(targetTrackId)
    if (targetIndex === undefined) return false

    container.scrollTop = Math.max(
      0,
      targetIndex * LIBRARY_LAYOUT_METRICS.flatRowHeight + LIBRARY_TOP_INSET,
    )
    scheduleFirstVisibleTrackIndexUpdate()
    return true
  }

  async function scrollToTrackById(
    targetTrackId: number,
    isRequestCurrent?: () => boolean,
    startGeneration: number = captureScrollGeneration(),
  ): Promise<void> {
    await nextTick()
    if (isRequestCurrent && !isRequestCurrent()) return
    if (isScrollInputCancelled(startGeneration)) return
    await new Promise((resolve) => window.requestAnimationFrame(resolve))
    if (isRequestCurrent && !isRequestCurrent()) return
    if (isScrollInputCancelled(startGeneration)) return
    scrollRenderedTrackToRatio(targetTrackId)
  }

  async function scrollToTrackIndex(index: number): Promise<void> {
    const track = options.tracks.value[index]
    if (!track) return
    await scrollToTrackById(track.id)
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
      el?.addEventListener('scroll', onScroll, { passive: true })
      el?.addEventListener('wheel', onUserScrollInput, { passive: true })
      el?.addEventListener('touchstart', onUserScrollInput, { passive: true })
      if (el) {
        void nextTick(() => scheduleFirstVisibleTrackIndexUpdate())
      }
    },
    { immediate: true },
  )

  function dispose(): void {
    stopScrollRefWatch()
    options.scrollRef.value?.removeEventListener('scroll', onScroll)
    options.scrollRef.value?.removeEventListener('wheel', onUserScrollInput)
    options.scrollRef.value?.removeEventListener('touchstart', onUserScrollInput)
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
    captureScrollGeneration,
    isScrollInputCancelled,
    onUserScrollInput,
    scheduleFirstVisibleTrackIndexUpdate,
    scrollRenderedTrackToRatio,
    scrollRenderedTrackToTop,
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
