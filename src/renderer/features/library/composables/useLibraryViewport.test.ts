import { computed, ref, type ComputedRef } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import { LIBRARY_LAYOUT_METRICS } from '../constants/libraryLayoutMetrics'
import { useLibraryViewport } from './useLibraryViewport'

function createTrack(id: number): TrackListItem {
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
    durationSeconds: null,
    artworkCacheKey: null,
    genre: null,
    availability: 'available',
    playCount: 0,
    lastPlayedAt: null,
    createdAt: '2026-08-28T00:00:00.000Z',
  }
}

function createScrollElement(scrollTop = 0, clientHeight = 400) {
  return {
    scrollTop,
    clientHeight,
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
}) {
  const sourceTracks = options?.tracks ?? [createTrack(1), createTrack(2), createTrack(3)]
  const tracks = ref(sourceTracks)
  const scrollElement = createScrollElement(options?.scrollTop ?? 100)
  const scrollRef = ref<HTMLElement | null>(scrollElement as unknown as HTMLElement)
  const isCoverView = computed(() => options?.isCoverView ?? false)
  const derivedIndex = computed(() => {
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
      albumGroupStartOffsets: [0],
      trackById,
    }
  })
  const albumGroups = computed(() => [{ firstTrackIndex: 0 }])
  const virtualAlbumGroups: ComputedRef<ReadonlyArray<{ index: number; end: number }>> = computed(
    () => [{ index: 0, end: 400 }],
  )

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
  })

  return { viewport, tracks, scrollElement, scrollRef }
}

describe('useLibraryViewport', () => {
  beforeEach(() => {
    installImmediateFrames()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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
      scrollTop: 16 + LIBRARY_LAYOUT_METRICS.flatRowHeight,
    })
    viewport.scheduleFirstVisibleTrackIndexUpdate()
    const capture = viewport.captureLibraryViewportRestore()
    tracks.value = [createTrack(1), createTrack(2), createTrack(3)]

    await viewport.restoreLibraryViewportRestore(capture, () => true)

    expect(scrollElement.scrollTop).toBe(16 + LIBRARY_LAYOUT_METRICS.flatRowHeight)
  })

  it('schedules first-visible index through the extracted pure function', () => {
    const { viewport, scrollElement } = createViewport({
      scrollTop: 16 + LIBRARY_LAYOUT_METRICS.flatRowHeight * 2,
    })

    viewport.scheduleFirstVisibleTrackIndexUpdate()

    expect(viewport.firstVisibleTrackIndex.value).toBe(2)
    expect(scrollElement.scrollTop).toBe(16 + LIBRARY_LAYOUT_METRICS.flatRowHeight * 2)
  })

  it('does not write scrollTop when scrollToTrackById is cancelled by user input', async () => {
    const { viewport, scrollElement } = createViewport({ scrollTop: 80 })
    const pending = viewport.scrollToTrackById(1)
    viewport.onUserScrollInput()
    await pending

    expect(scrollElement.scrollTop).toBe(80)
  })
})
