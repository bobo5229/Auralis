import { computed, ref, type ComputedRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import { LIBRARY_LAYOUT_METRICS } from '../constants/libraryLayoutMetrics'
import { getAlbumGroupEstimatedHeight } from '../constants/libraryLayoutMetrics'
import { getAlbumCoverDiscHeadingCount } from '../utils/albumCoverDiscHeadings'
import { createLibraryCatalogViewIndex } from '../utils/libraryCatalogViewIndex'
import { useLibraryViewport } from './useLibraryViewport'

function createTrack(id: number, patch: Partial<TrackListItem> = {}): TrackListItem {
  return {
    id,
    title: `Track ${id}`,
    artist: null,
    album: null,
    albumArtist: null,
    trackNo: null,
    discNo: null,
    releaseDate: null,
    copyright: null,
    composer: null,
    durationSeconds: null,
    artworkCacheKey: null,
    genre: null,
    availability: 'available',
    playCount: 0,
    lastPlayedAt: null,
    createdAt: '2026-08-28T00:00:00.000Z',
    ...patch,
  }
}

function createScrollElement(scrollTop = 0, clientHeight = 400) {
  return {
    scrollTop,
    clientHeight,
    scrollHeight: 10000,
    isConnected: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
}

function installImmediateFrames() {
  vi.stubGlobal('window', {
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    },
    cancelAnimationFrame: vi.fn(),
  })
}

function createViewport(options?: {
  tracks?: TrackListItem[]
  scrollTop?: number
  isCoverView?: boolean
  albumGroupStartOffset?: number
  virtualAlbumGroups?: Array<{ index: number; end: number }>
  flatRowHeight?: number
  groupByAlbum?: boolean
}) {
  const sourceTracks = options?.tracks ?? [createTrack(1), createTrack(2), createTrack(3)]
  const tracks = ref(sourceTracks)
  const scrollElement = createScrollElement(options?.scrollTop ?? 100)
  const scrollRef = ref<HTMLElement | null>(scrollElement as unknown as HTMLElement)
  const isCoverView = ref(options?.isCoverView ?? false)
  const derivedIndex = computed(() => {
    if (options?.groupByAlbum)
      return createLibraryCatalogViewIndex(tracks.value, (group) =>
        getAlbumGroupEstimatedHeight(
          group.tracks.length,
          Boolean(group.releaseDate),
          getAlbumCoverDiscHeadingCount(group.tracks),
        ),
      )
    const trackIndexById = new Map<number, number>()
    const trackById = new Map<number, TrackListItem>()
    const albumGroupIndexByTrackId = new Map<number, number>()
    tracks.value.forEach((track, index) => {
      trackIndexById.set(track.id, index)
      trackById.set(track.id, track)
      albumGroupIndexByTrackId.set(track.id, 0)
    })
    return {
      trackIndexById,
      albumGroupIndexByTrackId,
      albumGroupStartOffsets: [options?.albumGroupStartOffset ?? 0],
      trackById,
    }
  })
  const albumGroups = computed(() =>
    options?.groupByAlbum && 'albumGroups' in derivedIndex.value
      ? derivedIndex.value.albumGroups
      : [{ firstTrackIndex: 0, tracks: tracks.value }],
  )
  const virtualAlbumGroups: ComputedRef<ReadonlyArray<{ index: number; end: number }>> = computed(
    () => options?.virtualAlbumGroups ?? [{ index: 0, end: 400 }],
  )
  const flatRowHeight = ref(options?.flatRowHeight ?? LIBRARY_LAYOUT_METRICS.flatRowHeight)

  const viewport = useLibraryViewport({
    scrollRef,
    tracks,
    isCoverView,
    derivedIndex,
    albumGroups,
    virtualAlbumGroups,
    currentTrackId: () => 2,
    selectedTrackId: () => 1,
    isDisposed: () => false,
    flatRowHeight,
  })

  return { viewport, tracks, scrollElement, scrollRef, flatRowHeight, isCoverView }
}

describe('useLibraryViewport', () => {
  beforeEach(() => {
    installImmediateFrames()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('captures the live flat viewport without waiting for a scheduled scroll event, then survives remount', () => {
    const source = Array.from({ length: 100 }, (_, i) => createTrack(i + 1))
    const first = createViewport({ tracks: source, scrollTop: 508 })
    const saved = first.viewport.captureNavigationViewport()!
    expect(saved.anchorTrackIds[0]).toBe(11)
    expect(saved.anchorOffset).toBe(12)
    first.viewport.dispose()
    const returned = createViewport({ tracks: source, scrollTop: 0 })
    expect(
      returned.viewport.restoreNavigationViewport(
        saved,
        returned.viewport.captureNavigationIntent(),
        () => true,
      ),
    ).toBe(true)
    expect(returned.scrollElement.scrollTop).toBe(508)
    returned.viewport.dispose()
  })

  it('restores the same song after reorder, a nearby surviving song after deletion, and clamps the fallback', () => {
    const source = Array.from({ length: 100 }, (_, i) => createTrack(i + 1))
    const first = createViewport({ tracks: source, scrollTop: 508 })
    const saved = first.viewport.captureNavigationViewport()!
    const returned = createViewport({
      tracks: [source[10], ...source.filter((t) => t.id !== 11)],
      scrollTop: 0,
    })
    const intent = returned.viewport.captureNavigationIntent()
    returned.viewport.restoreNavigationViewport(saved, intent, () => true)
    expect(returned.scrollElement.scrollTop).toBe(28)
    returned.tracks.value = source.filter((t) => t.id !== 11)
    returned.viewport.restoreNavigationViewport(saved, intent, () => true)
    expect(returned.scrollElement.scrollTop).toBe(508)
    returned.tracks.value = [createTrack(1000)]
    returned.scrollElement.scrollHeight = 500
    returned.viewport.restoreNavigationViewport(saved, intent, () => true)
    expect(returned.scrollElement.scrollTop).toBe(100)
    first.viewport.dispose()
    returned.viewport.dispose()
  })

  it('keeps cover track and disc heading offsets and maps the anchor into the flat view', () => {
    const source = Array.from({ length: 100 }, (_, i) =>
      createTrack(i + 1, { discNo: i < 10 ? 1 : 2 }),
    )
    const { viewport, scrollElement, isCoverView } = createViewport({
      tracks: source,
      scrollTop: 560,
      isCoverView: true,
    })
    const saved = viewport.captureNavigationViewport()!
    expect(saved.anchorTrackIds[0]).toBe(11)
    expect(saved.anchorOffset).toBe(12)
    scrollElement.scrollTop = 0
    viewport.restoreNavigationViewport(saved, viewport.captureNavigationIntent(), () => true)
    expect(scrollElement.scrollTop).toBe(560)
    isCoverView.value = false
    viewport.restoreNavigationViewport(saved, viewport.captureNavigationIntent(), () => true)
    expect(scrollElement.scrollTop).toBe(508)
    viewport.dispose()
  })

  it('captures cover anchors and neighboring songs in visual order for interleaved album tracks', () => {
    const source = [
      createTrack(1, { album: 'A' }),
      createTrack(2, { album: 'B' }),
      createTrack(3, { album: 'A' }),
      createTrack(4, { album: 'B' }),
    ]
    const { viewport, scrollElement } = createViewport({
      tracks: source,
      scrollTop: 96,
      isCoverView: true,
      groupByAlbum: true,
    })
    const saved = viewport.captureNavigationViewport()!
    expect(saved.anchorTrackIds.slice(0, 3)).toEqual([3, 2, 1])
    expect(saved.anchorOffset).toBe(4)
    scrollElement.scrollTop = 0
    viewport.restoreNavigationViewport(saved, viewport.captureNavigationIntent(), () => true)
    expect(scrollElement.scrollTop).toBe(96)
    viewport.dispose()
  })

  it('keeps the anchor fraction after row resizing and preserves the start position', () => {
    const source = Array.from({ length: 100 }, (_, i) => createTrack(i + 1))
    const { viewport, scrollElement, flatRowHeight } = createViewport({
      tracks: source,
      scrollTop: 508,
    })
    const saved = viewport.captureNavigationViewport()!
    flatRowHeight.value = 60
    viewport.restoreNavigationViewport(saved, viewport.captureNavigationIntent(), () => true)
    expect(scrollElement.scrollTop).toBe(631)
    scrollElement.scrollTop = 0
    const start = viewport.captureNavigationViewport()!
    scrollElement.scrollTop = 100
    viewport.restoreNavigationViewport(start, viewport.captureNavigationIntent(), () => true)
    expect(scrollElement.scrollTop).toBe(0)
    viewport.dispose()
  })

  it('abandons navigation restore after new user input, explicit locate, or a stale route', async () => {
    const source = Array.from({ length: 100 }, (_, i) => createTrack(i + 1))
    const { viewport, scrollElement } = createViewport({ tracks: source, scrollTop: 508 })
    const saved = viewport.captureNavigationViewport()!
    const intent = viewport.captureNavigationIntent()
    viewport.onUserScrollInput()
    scrollElement.scrollTop = 123
    expect(viewport.restoreNavigationViewport(saved, intent, () => true)).toBe(false)
    expect(scrollElement.scrollTop).toBe(123)
    const locateIntent = viewport.captureNavigationIntent()
    await viewport.scrollToTrackById(1)
    expect(viewport.restoreNavigationViewport(saved, locateIntent, () => true)).toBe(false)
    expect(scrollElement.scrollTop).toBe(0)
    expect(
      viewport.restoreNavigationViewport(saved, viewport.captureNavigationIntent(), () => false),
    ).toBe(false)
    viewport.dispose()
  })

  it('does not capture or restore a detached, zero-height or empty list', () => {
    const { viewport, scrollElement, tracks } = createViewport()
    const saved = viewport.captureNavigationViewport()!
    scrollElement.isConnected = false
    expect(viewport.captureNavigationViewport()).toBeNull()
    expect(
      viewport.restoreNavigationViewport(saved, viewport.captureNavigationIntent(), () => true),
    ).toBe(false)
    scrollElement.isConnected = true
    scrollElement.clientHeight = 0
    expect(viewport.captureNavigationViewport()).toBeNull()
    scrollElement.clientHeight = 400
    tracks.value = []
    expect(viewport.captureNavigationViewport()).toBeNull()
    viewport.dispose()
  })

  it('cancels deferred work when the user-scroll generation moves', () => {
    const { viewport } = createViewport()
    const generation = viewport.captureScrollGeneration()
    expect(viewport.isScrollInputCancelled(generation)).toBe(false)

    viewport.onUserScrollInput()
    expect(viewport.isScrollInputCancelled(generation)).toBe(true)
  })

  it('keeps the captured scrollTop when restore sees an unchanged id sequence', async () => {
    const { viewport, scrollElement } = createViewport({ scrollTop: 420 })
    const capture = viewport.captureLibraryViewportRestore()
    scrollElement.scrollTop = 0

    await viewport.restoreLibraryViewportRestore(capture, () => true)

    expect(scrollElement.scrollTop).toBe(420)
  })

  it('abandons restore when the user scrolled during the snapshot round-trip', async () => {
    const { viewport, scrollElement } = createViewport({ scrollTop: 420 })
    const capture = viewport.captureLibraryViewportRestore()
    viewport.onUserScrollInput()
    scrollElement.scrollTop = 12

    await viewport.restoreLibraryViewportRestore(capture, () => true)

    expect(scrollElement.scrollTop).toBe(12)
  })

  it('restores the first visible track to the top instead of the 33% playback ratio', async () => {
    const { viewport, tracks, scrollElement } = createViewport({
      tracks: [createTrack(1), createTrack(2)],
      scrollTop: LIBRARY_LAYOUT_METRICS.flatRowsInset + LIBRARY_LAYOUT_METRICS.flatRowHeight,
    })
    viewport.scheduleFirstVisibleTrackIndexUpdate()
    const capture = viewport.captureLibraryViewportRestore()
    tracks.value = [createTrack(1), createTrack(2), createTrack(3)]

    await viewport.restoreLibraryViewportRestore(capture, () => true)

    expect(scrollElement.scrollTop).toBe(
      LIBRARY_LAYOUT_METRICS.flatRowsInset + LIBRARY_LAYOUT_METRICS.flatRowHeight,
    )
  })

  it('schedules first-visible index through the extracted pure function', () => {
    const { viewport, scrollElement } = createViewport({
      scrollTop: LIBRARY_LAYOUT_METRICS.flatRowsInset + LIBRARY_LAYOUT_METRICS.flatRowHeight * 2,
    })

    viewport.scheduleFirstVisibleTrackIndexUpdate()

    expect(viewport.firstVisibleTrackIndex.value).toBe(2)
    expect(scrollElement.scrollTop).toBe(
      LIBRARY_LAYOUT_METRICS.flatRowsInset + LIBRARY_LAYOUT_METRICS.flatRowHeight * 2,
    )
  })

  it('excludes rows fully covered by the sticky column header from the first-visible track', () => {
    const { viewport } = createViewport({
      scrollTop: LIBRARY_LAYOUT_METRICS.flatRowsInset + LIBRARY_LAYOUT_METRICS.flatRowHeight,
    })

    viewport.scheduleFirstVisibleTrackIndexUpdate()

    expect(viewport.firstVisibleTrackIndex.value).toBe(1)
  })

  it('does not write scrollTop when scrollToTrackById is cancelled by user input', async () => {
    const { viewport, scrollElement } = createViewport({ scrollTop: 80 })
    const pending = viewport.scrollToTrackById(1)
    viewport.onUserScrollInput()
    await pending

    expect(scrollElement.scrollTop).toBe(80)
  })

  it('positions a late search hit within an unmounted long cover album', async () => {
    const tracks = Array.from({ length: 20 }, (_, index) => createTrack(index + 1))
    const { viewport, scrollElement } = createViewport({
      tracks,
      isCoverView: true,
      albumGroupStartOffset: 4_000,
      virtualAlbumGroups: [],
    })

    await viewport.scrollToTrackIndex(19)

    expect(scrollElement.scrollTop).toBe(4_824)
    const targetRowTop =
      16 +
      4_000 +
      LIBRARY_LAYOUT_METRICS.coverGroupPaddingBlockSide +
      LIBRARY_LAYOUT_METRICS.coverPanelBorderWidth +
      LIBRARY_LAYOUT_METRICS.coverPanelPaddingBlockSide +
      19 * LIBRARY_LAYOUT_METRICS.coverTrackRowHeight
    expect(targetRowTop - scrollElement.scrollTop).toBe(132)
  })

  it('includes only the in-flow Disc 2 heading when positioning a Disc 2 search hit', async () => {
    const tracks = Array.from({ length: 16 }, (_, index) =>
      createTrack(index + 1, { discNo: index < 8 ? 1 : 2 }),
    )
    const { viewport, scrollElement } = createViewport({
      tracks,
      isCoverView: true,
      albumGroupStartOffset: 8_000,
      virtualAlbumGroups: [],
    })

    await viewport.scrollToTrackIndex(8)

    expect(scrollElement.scrollTop).toBe(8_320)
    const targetRowTop =
      16 +
      8_000 +
      LIBRARY_LAYOUT_METRICS.coverGroupPaddingBlockSide +
      LIBRARY_LAYOUT_METRICS.coverPanelBorderWidth +
      LIBRARY_LAYOUT_METRICS.coverPanelPaddingBlockSide +
      8 * LIBRARY_LAYOUT_METRICS.coverTrackRowHeight +
      LIBRARY_LAYOUT_METRICS.coverDiscHeadingHeight
    expect(targetRowTop - scrollElement.scrollTop).toBe(132)
  })

  it.each([
    [0, 3_912],
    [4, 4_128],
    [8, 4_344],
  ])('positions track %i with only preceding in-flow disc headings', async (index, expectedTop) => {
    const tracks = Array.from({ length: 12 }, (_, trackIndex) =>
      createTrack(trackIndex + 1, { discNo: Math.floor(trackIndex / 4) + 1 }),
    )
    const { viewport, scrollElement } = createViewport({
      tracks,
      isCoverView: true,
      albumGroupStartOffset: 4_000,
      virtualAlbumGroups: [],
    })

    await viewport.scrollToTrackIndex(index)

    expect(scrollElement.scrollTop).toBe(expectedTop)
  })

  it('positions flat-view search results at 33% of the area below the sticky header', async () => {
    const tracks = Array.from({ length: 16 }, (_, index) => createTrack(index + 1))
    const { viewport, scrollElement } = createViewport({ tracks })

    await viewport.scrollToTrackIndex(10)

    const targetRowTop =
      10 * LIBRARY_LAYOUT_METRICS.flatRowHeight +
      LIBRARY_LAYOUT_METRICS.flatHeaderHeight +
      LIBRARY_LAYOUT_METRICS.flatRowsInset
    const expectedVisibleOffset =
      LIBRARY_LAYOUT_METRICS.flatHeaderHeight +
      (scrollElement.clientHeight - LIBRARY_LAYOUT_METRICS.flatHeaderHeight) * 0.33
    expect(scrollElement.scrollTop).toBeCloseTo(targetRowTop - expectedVisibleOffset)
    expect(targetRowTop - scrollElement.scrollTop).toBeCloseTo(expectedVisibleOffset)
  })

  it('restores a flat track to the visible edge below the sticky header', () => {
    const { viewport, scrollElement } = createViewport({ tracks: [createTrack(1), createTrack(2)] })

    viewport.scrollRenderedTrackToTop(2)

    const targetRowTop =
      LIBRARY_LAYOUT_METRICS.flatRowHeight +
      LIBRARY_LAYOUT_METRICS.flatHeaderHeight +
      LIBRARY_LAYOUT_METRICS.flatRowsInset
    expect(targetRowTop - scrollElement.scrollTop - LIBRARY_LAYOUT_METRICS.flatHeaderHeight).toBe(0)
  })

  it('keeps the flat scroll anchor fraction when artwork changes row height', async () => {
    const initialHeight = 48
    const nextHeight = 84
    const trackIndex = 4
    const anchorFraction = 0.375
    const scrollTop =
      LIBRARY_LAYOUT_METRICS.flatRowsInset + (trackIndex + anchorFraction) * initialHeight
    const { viewport, scrollElement } = createViewport({
      tracks: Array.from({ length: 10 }, (_, index) => createTrack(index + 1)),
      scrollTop,
      flatRowHeight: initialHeight,
    })

    await viewport.preserveFlatScrollAnchorForRowHeight(initialHeight, nextHeight)

    expect(scrollElement.scrollTop).toBe(
      LIBRARY_LAYOUT_METRICS.flatRowsInset + (trackIndex + anchorFraction) * nextHeight,
    )
    const nextOffset = scrollElement.scrollTop - LIBRARY_LAYOUT_METRICS.flatRowsInset
    expect(nextOffset / nextHeight - Math.floor(nextOffset / nextHeight)).toBeCloseTo(
      anchorFraction,
    )
  })

  it('keeps a top-inset scroll position unchanged when row height changes', async () => {
    const { viewport, scrollElement } = createViewport({ scrollTop: 8 })

    await viewport.preserveFlatScrollAnchorForRowHeight(48, 124)

    expect(scrollElement.scrollTop).toBe(8)
  })

  it('does not apply a deferred layout anchor after new user scroll input', async () => {
    const { viewport, scrollElement } = createViewport({ scrollTop: 214 })
    const adjustment = viewport.preserveFlatScrollAnchorForRowHeight(48, 124)
    viewport.onUserScrollInput()
    scrollElement.scrollTop = 96

    await adjustment

    expect(scrollElement.scrollTop).toBe(96)
  })

  it('discards a pending row-height anchor when switching views', async () => {
    const { viewport, scrollElement } = createViewport({ scrollTop: 214 })
    const adjustment = viewport.preserveFlatScrollAnchorForRowHeight(48, 124)
    viewport.beginViewSwitch(2)
    scrollElement.scrollTop = 80

    await adjustment

    expect(scrollElement.scrollTop).toBe(80)
  })

  it('keeps cover playback positioning at the album group start', async () => {
    const tracks = Array.from({ length: 16 }, (_, index) => createTrack(index + 1))
    const { viewport, scrollElement } = createViewport({
      tracks,
      isCoverView: true,
      albumGroupStartOffset: 4_000,
    })

    await viewport.scrollToTrackById(16)

    expect(scrollElement.scrollTop).toBe(3_884)
  })

  it('does not scroll when search request becomes invalid during nextTick or rAF wait', async () => {
    const tracks = Array.from({ length: 16 }, (_, index) => createTrack(index + 1))
    const { viewport, scrollElement } = createViewport({ tracks, scrollTop: 50 })

    let isCurrent = true
    const scrollPromise = viewport.scrollToTrackIndex(5, () => isCurrent)
    // Invalidate request while deferred
    isCurrent = false
    await scrollPromise

    expect(scrollElement.scrollTop).toBe(50)
  })

  it('does not scroll when user scrolls during scrollToTrackIndex deferred wait', async () => {
    const tracks = Array.from({ length: 16 }, (_, index) => createTrack(index + 1))
    const { viewport, scrollElement } = createViewport({ tracks, scrollTop: 50 })

    const scrollPromise = viewport.scrollToTrackIndex(5, () => true)
    // User scrolls during deferred wait
    viewport.onUserScrollInput()
    await scrollPromise

    expect(scrollElement.scrollTop).toBe(50)
  })

  it('positions correctly when search request remains valid and user does not scroll', async () => {
    const tracks = Array.from({ length: 16 }, (_, index) => createTrack(index + 1))
    const { viewport, scrollElement } = createViewport({ tracks, scrollTop: 50 })

    await viewport.scrollToTrackIndex(5, () => true)

    const targetRowTop =
      5 * LIBRARY_LAYOUT_METRICS.flatRowHeight +
      LIBRARY_LAYOUT_METRICS.flatHeaderHeight +
      LIBRARY_LAYOUT_METRICS.flatRowsInset
    const targetViewportTop =
      LIBRARY_LAYOUT_METRICS.flatHeaderHeight +
      (scrollElement.clientHeight - LIBRARY_LAYOUT_METRICS.flatHeaderHeight) * 0.33
    expect(scrollElement.scrollTop).toBeCloseTo(targetRowTop - targetViewportTop)
  })
})
