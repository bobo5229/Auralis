import { ref, shallowRef } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { LibraryTrackPage } from '@shared/types/libraryCatalog'
import type { LibraryPageIdentity } from '../types/libraryPageIdentity'
import type { LibraryViewMode } from '../types/libraryInteraction'
import type { LibraryViewportCapture } from './useLibraryViewport'
import { useLibraryCatalogLoader } from './useLibraryCatalogLoader'

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

function createPage(tracks: TrackListItem[]): LibraryTrackPage {
  return {
    snapshotId: `snapshot-${tracks.map((track) => track.id).join('-') || 'empty'}`,
    totalTracks: tracks.length,
    tracks,
    nextCursor: null,
    diagnostics: { snapshotBuildMs: 1, pageSliceMs: 0.1 },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function createLoader(overrides?: {
  getTrackPage?: (request: unknown) => Promise<LibraryTrackPage>
}) {
  let disposed = false
  const pageIdentity = ref<LibraryPageIdentity | null>({ kind: 'library' })
  const tracks = shallowRef<TrackListItem[]>([])
  const libraryViewMode = ref<LibraryViewMode>('flat')
  const isLoading = ref(false)
  const onSnapshotCommitted = vi.fn()
  const captureViewportRestore = vi.fn(
    (): LibraryViewportCapture => ({
      restore: { scrollTop: 0, firstVisibleTrackId: null, scrollGeneration: 0 },
      previousTrackIds: [],
    }),
  )
  const restoreViewportRestore = vi.fn(async () => undefined)
  const scrollToPlaybackTrack = vi.fn(async () => undefined)
  const replaceWithLibraryHome = vi.fn(async () => undefined)
  let changedHandler: ((event: { reason: string }) => void | Promise<void>) | null = null
  const getTrackPage =
    overrides?.getTrackPage ?? vi.fn(async () => createPage([createTrack(1), createTrack(2)]))

  const loader = useLibraryCatalogLoader({
    isDisposed: () => disposed,
    captureRouteScope: () => ({ kind: 'library' as const }),
    pageIdentity,
    tracks,
    libraryViewMode,
    isLoading,
    getTrackPage,
    getPlaylistDetail: vi.fn(async () => null),
    getSmartPlaylistDetail: vi.fn(async () => null),
    readPersistedViewMode: () => 'flat' as const,
    onSnapshotCommitted,
    captureViewportRestore,
    restoreViewportRestore,
    scrollToPlaybackTrack,
    replaceWithLibraryHome,
    loadErrorMessage: () => 'load failed',
    onLibraryChanged: (callback) => {
      changedHandler = callback
      return () => {
        changedHandler = null
      }
    },
    onScanProgress: () => () => undefined,
  })

  return {
    loader,
    pageIdentity,
    tracks,
    isLoading,
    getTrackPage,
    onSnapshotCommitted,
    restoreViewportRestore,
    scrollToPlaybackTrack,
    emitLibraryChanged: async (reason: string) => {
      await changedHandler?.({ reason })
    },
    dispose: () => {
      disposed = true
      loader.dispose()
    },
  }
}

describe('useLibraryCatalogLoader', () => {
  afterEach(() => vi.useRealTimers())

  it('coalesces spaced imports and flushes the final change', async () => {
    vi.useFakeTimers()
    const { loader, getTrackPage, emitLibraryChanged, dispose } = createLoader()
    loader.subscribeLibraryEvents()
    for (let i = 0; i < 3; i++) {
      await emitLibraryChanged('track-added')
      await vi.advanceTimersByTimeAsync(800)
    }
    expect(getTrackPage).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(getTrackPage).toHaveBeenCalledOnce()
    dispose()
  })

  it('refreshes during continuous imports and cancels pending timers on dispose', async () => {
    vi.useFakeTimers()
    const { loader, getTrackPage, emitLibraryChanged, dispose } = createLoader()
    loader.subscribeLibraryEvents()
    for (let i = 0; i < 4; i++) {
      await emitLibraryChanged('track-relocated')
      await vi.advanceTimersByTimeAsync(800)
    }
    expect(getTrackPage).toHaveBeenCalledOnce()
    await emitLibraryChanged('track-added')
    dispose()
    await vi.runAllTimersAsync()
    expect(getTrackPage).toHaveBeenCalledOnce()
  })

  it('keeps missing-track refresh immediate and absorbs a pending import refresh', async () => {
    vi.useFakeTimers()
    const { loader, getTrackPage, emitLibraryChanged, dispose } = createLoader()
    loader.subscribeLibraryEvents()
    await emitLibraryChanged('track-added')
    await emitLibraryChanged('track-missing')
    expect(getTrackPage).toHaveBeenCalledOnce()
    await vi.runAllTimersAsync()
    expect(getTrackPage).toHaveBeenCalledOnce()
    dispose()
  })

  it('keeps a complete prior snapshot and identity visible after a failed reload', async () => {
    const getTrackPage = vi
      .fn()
      .mockResolvedValueOnce(createPage([createTrack(1)]))
      .mockRejectedValueOnce(new Error('query failed'))
    const { loader, tracks, pageIdentity, isLoading } = createLoader({ getTrackPage })
    await loader.loadLibraryData()
    await loader.retryInitialLoad()
    expect(tracks.value.map((track) => track.id)).toEqual([1])
    expect(pageIdentity.value).toEqual({ kind: 'library' })
    expect(isLoading.value).toBe(false)
    expect(loader.initialLoadError.value).toBe('load failed')
  })
  it('queues background refresh while foreground is in flight and flushes after finish', async () => {
    const gate = deferred<LibraryTrackPage>()
    const getTrackPage = vi
      .fn()
      .mockImplementationOnce(() => gate.promise)
      .mockResolvedValueOnce(createPage([createTrack(3)]))
    const { loader, tracks, onSnapshotCommitted } = createLoader({ getTrackPage })

    const foreground = loader.loadLibraryData('foreground')
    await Promise.resolve()
    const background = await loader.loadLibraryData('background')
    expect(background).toBe('queued')
    expect(getTrackPage).toHaveBeenCalledOnce()

    gate.resolve(createPage([createTrack(1), createTrack(2)]))
    expect(await foreground).toBe('committed')
    expect(tracks.value.map((track) => track.id)).toEqual([1, 2])

    await vi.waitFor(() => {
      expect(getTrackPage).toHaveBeenCalledTimes(2)
    })
    await vi.waitFor(() => {
      expect(tracks.value.map((track) => track.id)).toEqual([3])
    })
    expect(onSnapshotCommitted).toHaveBeenCalledTimes(2)
  })

  it('waits for the active foreground request before starting metadata-save', async () => {
    const gate = deferred<LibraryTrackPage>()
    const getTrackPage = vi
      .fn()
      .mockImplementationOnce(() => gate.promise)
      .mockResolvedValueOnce(createPage([createTrack(9)]))
    const { loader, tracks } = createLoader({ getTrackPage })

    const foreground = loader.loadLibraryData('foreground')
    await Promise.resolve()
    const metadataSave = loader.loadLibraryData('metadata-save')
    await Promise.resolve()
    expect(getTrackPage).toHaveBeenCalledOnce()

    gate.resolve(createPage([createTrack(1)]))
    expect(await foreground).toBe('committed')
    expect(await metadataSave).toBe('committed')
    expect(getTrackPage).toHaveBeenCalledTimes(2)
    expect(tracks.value.map((track) => track.id)).toEqual([9])
  })

  it('does not reload on play-stats library events', async () => {
    const { loader, getTrackPage, emitLibraryChanged } = createLoader()
    loader.subscribeLibraryEvents()

    await emitLibraryChanged('play-stats-updated')
    await emitLibraryChanged('play-stats-reset')
    expect(getTrackPage).not.toHaveBeenCalled()

    await emitLibraryChanged('file-change')
    await vi.waitFor(() => {
      expect(getTrackPage).toHaveBeenCalledOnce()
    })
  })

  it('does not commit a stale generation after a newer request starts', async () => {
    const first = deferred<LibraryTrackPage>()
    const getTrackPage = vi.fn().mockImplementationOnce(() => first.promise)
    const { loader, tracks, onSnapshotCommitted, scrollToPlaybackTrack } = createLoader({
      getTrackPage,
    })

    const stale = loader.loadLibraryData('foreground')
    await Promise.resolve()
    const latest = loader.loadLibraryData('foreground')
    await Promise.resolve()

    first.resolve(createPage([createTrack(1)]))
    expect(await stale).toBe('stale')
    expect(await latest).toBe('committed')
    expect(getTrackPage).toHaveBeenCalledOnce()
    expect(onSnapshotCommitted).toHaveBeenCalledOnce()
    expect(tracks.value.map((track) => track.id)).toEqual([1])
    expect(scrollToPlaybackTrack).toHaveBeenCalledOnce()
  })
})
