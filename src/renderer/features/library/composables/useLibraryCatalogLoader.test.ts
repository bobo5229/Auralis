import { ref, shallowRef } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LibraryScanProgress, TrackListItem } from '@shared/types/libraryScan'
import type { LibraryTrackPage, LibraryTrackPageRequest } from '@shared/types/libraryCatalog'
import type { LibraryPageIdentity } from '../types/libraryPageIdentity'
import type { LibraryViewMode } from '../types/libraryInteraction'
import type { LibraryRouteScope } from '../utils/libraryRouteScope'
import type { SmartPlaylistDetail, SmartPlaylistRule } from '@shared/types/smartPlaylist'
import type { PlaylistDetail } from '@shared/types/playlist'
import type { LibraryViewportCapture } from './useLibraryViewport'
import { useLibraryCatalogLoader } from './useLibraryCatalogLoader'

// Keep the actual snapshot/cursor implementation in the runtime fixture only.
const storeModule = '../../../../main/features/libraryCatalog/libraryCatalogSnapshotStore'
const { LibraryCatalogSnapshotStore } = (await import(storeModule)) as {
  LibraryCatalogSnapshotStore: new (load: () => TrackListItem[]) => {
    getPage(request?: LibraryTrackPageRequest): LibraryTrackPage
  }
}

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
    composer: null,
    bitrateBps: null,
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
  captureRouteScope?: () => LibraryRouteScope
  getSmartPlaylistDetail?: (id: number) => Promise<SmartPlaylistDetail | null>
  getPlaylistDetail?: (id: number) => Promise<PlaylistDetail | null>
  getTrackPage?: (request: LibraryTrackPageRequest) => Promise<LibraryTrackPage>
  prepareForegroundViewport?: (isRequestCurrent: () => boolean) => Promise<void>
  restoreNavigationViewport?: (isRequestCurrent: () => boolean) => Promise<boolean>
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
  const prepareForegroundViewport = vi.fn(
    overrides?.prepareForegroundViewport ?? (async () => undefined),
  )
  const restoreNavigationViewport = vi.fn(
    overrides?.restoreNavigationViewport ?? (async () => false),
  )
  let changedHandler: ((event: { reason: string }) => void | Promise<void>) | null = null
  let scanHandler: ((progress: LibraryScanProgress) => void | Promise<void>) | null = null
  const subscribeChanged = vi.fn((callback: NonNullable<typeof changedHandler>) => {
    changedHandler = callback
    return () => {
      changedHandler = null
    }
  })
  const subscribeScan = vi.fn((callback: NonNullable<typeof scanHandler>) => {
    scanHandler = callback
    return () => {
      scanHandler = null
    }
  })
  const getTrackPage =
    overrides?.getTrackPage ?? vi.fn(async () => createPage([createTrack(1), createTrack(2)]))

  const loader = useLibraryCatalogLoader({
    isDisposed: () => disposed,
    captureRouteScope: overrides?.captureRouteScope ?? (() => ({ kind: 'library' as const })),
    pageIdentity,
    tracks,
    libraryViewMode,
    isLoading,
    getTrackPage,
    getPlaylistDetail: overrides?.getPlaylistDetail ?? vi.fn(async () => null),
    getSmartPlaylistDetail: overrides?.getSmartPlaylistDetail ?? vi.fn(async () => null),
    readPersistedViewMode: () => 'flat' as const,
    onSnapshotCommitted,
    captureViewportRestore,
    restoreViewportRestore,
    scrollToPlaybackTrack,
    prepareForegroundViewport,
    restoreNavigationViewport,
    replaceWithLibraryHome,
    loadErrorMessage: () => 'load failed',
    onLibraryChanged: subscribeChanged,
    onScanProgress: subscribeScan,
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
    prepareForegroundViewport,
    restoreNavigationViewport,
    subscribeChanged,
    subscribeScan,
    emitLibraryChanged: async (reason: string) => {
      await changedHandler?.({ reason })
    },
    emitScanCompleted: async () => {
      await scanHandler?.({ status: 'completed' } as LibraryScanProgress)
    },
    dispose: () => {
      disposed = true
      loader.dispose()
    },
  }
}

describe('useLibraryCatalogLoader', () => {
  afterEach(() => vi.useRealTimers())

  function smartDetail(rule: SmartPlaylistRule, ids: number[]): SmartPlaylistDetail {
    return {
      playlist: {
        id: 1,
        name: 'Smart',
        rule,
        viewMode: 'flat',
        sortOrder: 0,
        createdAt: '',
        updatedAt: '',
      },
      tracks: ids.map(createTrack),
    }
  }

  it.each<SmartPlaylistRule>([
    { preset: 'recentPlayed', days: 7 },
    { preset: 'mostListened' },
    { preset: 'recentFrequent', days: 7 },
  ])('reconciles membership and order for $preset on playback and reset', async (rule) => {
    let source = smartDetail(rule, [])
    const getDetail = vi.fn(async () => source)
    const returned = createLoader({
      captureRouteScope: () => ({ kind: 'smart-playlist', id: 1 }),
      getSmartPlaylistDetail: getDetail,
    })
    returned.loader.subscribeLibraryEvents()
    await returned.loader.loadLibraryData()
    source = smartDetail(rule, [2, 1])
    await returned.emitLibraryChanged('play-stats-updated')
    expect(returned.tracks.value.map((track) => track.id)).toEqual([2, 1])
    source = smartDetail(rule, [1, 2])
    await returned.emitLibraryChanged('play-stats-updated')
    expect(returned.tracks.value.map((track) => track.id)).toEqual([1, 2])
    source = smartDetail(rule, [])
    await returned.emitLibraryChanged('play-stats-reset')
    expect(returned.tracks.value).toEqual([])
    expect(returned.getTrackPage).not.toHaveBeenCalled()
    returned.dispose()
  })

  it.each<SmartPlaylistRule>([
    { preset: 'recentAdded', days: 7 },
    { conditions: [{ field: 'genre', value: 'Rock' }] },
  ])('does not reread non-statistical smart rules on playback events', async (rule) => {
    const gate = deferred<SmartPlaylistDetail>()
    const getDetail = vi.fn(() => gate.promise)
    const returned = createLoader({
      captureRouteScope: () => ({ kind: 'smart-playlist', id: 1 }),
      getSmartPlaylistDetail: getDetail,
    })
    returned.loader.subscribeLibraryEvents()
    const loading = returned.loader.loadLibraryData()
    await returned.emitLibraryChanged('play-stats-updated')
    gate.resolve(smartDetail(rule, [1]))
    expect(await loading).toBe('committed')
    await returned.emitLibraryChanged('play-stats-reset')
    expect(getDetail).toHaveBeenCalledOnce()
    returned.dispose()
  })

  it('ignores playback events on a manual playlist', async () => {
    const getDetail = vi.fn(async () => ({
      playlist: {
        id: 1,
        name: 'Manual',
        viewMode: 'flat' as const,
        sortOrder: 0,
        createdAt: '',
        updatedAt: '',
      },
      tracks: [createTrack(1)],
    }))
    const returned = createLoader({
      captureRouteScope: () => ({ kind: 'playlist', id: 1 }),
      getPlaylistDetail: getDetail,
    })
    returned.loader.subscribeLibraryEvents()
    await returned.loader.loadLibraryData()
    await returned.emitLibraryChanged('play-stats-updated')
    await returned.emitLibraryChanged('play-stats-reset')
    expect(getDetail).toHaveBeenCalledOnce()
    expect(returned.getTrackPage).not.toHaveBeenCalled()
    returned.dispose()
  })

  it('rejects first-load and background results invalidated by consecutive statistics events', async () => {
    const first = deferred<SmartPlaylistDetail>()
    const second = deferred<SmartPlaylistDetail>()
    const rule = { preset: 'recentPlayed' as const, days: 7 }
    const getDetail = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
      .mockResolvedValue(smartDetail(rule, []))
    const returned = createLoader({
      captureRouteScope: () => ({ kind: 'smart-playlist', id: 1 }),
      getSmartPlaylistDetail: getDetail,
    })
    returned.loader.subscribeLibraryEvents()
    const loading = returned.loader.loadLibraryData()
    await returned.emitLibraryChanged('play-stats-updated')
    first.resolve(smartDetail(rule, []))
    expect(await loading).toBe('stale')
    await vi.waitFor(() => expect(getDetail).toHaveBeenCalledTimes(2))
    await returned.emitLibraryChanged('play-stats-updated')
    await returned.emitLibraryChanged('play-stats-reset')
    second.resolve(smartDetail(rule, [1]))
    await vi.waitFor(() => expect(returned.onSnapshotCommitted).toHaveBeenCalledOnce())
    expect(returned.tracks.value).toEqual([])
    expect(getDetail).toHaveBeenCalledTimes(3)
    returned.dispose()
  })

  it('queues reconciliation when statistics change between the first detail resolving and commit', async () => {
    const gate = deferred<SmartPlaylistDetail>()
    const rule = { preset: 'mostListened' as const }
    const getDetail = vi
      .fn()
      .mockImplementationOnce(() => gate.promise)
      .mockResolvedValue(smartDetail(rule, [2]))
    const returned = createLoader({
      captureRouteScope: () => ({ kind: 'smart-playlist', id: 1 }),
      getSmartPlaylistDetail: getDetail,
    })
    returned.loader.subscribeLibraryEvents()
    const loading = returned.loader.loadLibraryData()
    gate.resolve(smartDetail(rule, [1]))
    await Promise.resolve()
    await returned.emitLibraryChanged('play-stats-updated')
    expect(await loading).toBe('stale')
    await vi.waitFor(() => expect(returned.tracks.value.map((track) => track.id)).toEqual([2]))
    expect(returned.onSnapshotCommitted).toHaveBeenCalledOnce()
    returned.dispose()
  })

  it.each(['route', 'dispose'])(
    'does not commit a pending statistics refresh after %s change',
    async (change) => {
      const gate = deferred<SmartPlaylistDetail>()
      const rule = { preset: 'mostListened' as const }
      let scope: LibraryRouteScope = { kind: 'smart-playlist', id: 1 }
      const getDetail = vi
        .fn()
        .mockResolvedValueOnce(smartDetail(rule, [1]))
        .mockImplementation(() => gate.promise)
      const returned = createLoader({
        captureRouteScope: () => scope,
        getSmartPlaylistDetail: getDetail,
      })
      returned.loader.subscribeLibraryEvents()
      await returned.loader.loadLibraryData()
      const pending = returned.emitLibraryChanged('play-stats-reset')
      if (change === 'dispose') returned.dispose()
      else scope = { kind: 'library' }
      gate.resolve(smartDetail(rule, []))
      await pending
      expect(returned.tracks.value.map((track) => track.id)).toEqual([1])
      expect(returned.onSnapshotCommitted).toHaveBeenCalledOnce()
      returned.dispose()
    },
  )

  it('mounts and prepares the foreground viewport before restoring navigation, without playback overriding it', async () => {
    const ready = deferred<void>()
    const returned = createLoader({
      prepareForegroundViewport: () => ready.promise,
      restoreNavigationViewport: async () => true,
    })
    const pending = returned.loader.loadLibraryData('foreground')
    await vi.waitFor(() => expect(returned.prepareForegroundViewport).toHaveBeenCalledOnce())
    expect(returned.isLoading.value).toBe(false)
    expect(returned.loader.isPositioningForegroundViewport.value).toBe(true)
    expect(returned.restoreNavigationViewport).not.toHaveBeenCalled()
    ready.resolve()
    expect(await pending).toBe('committed')
    expect(returned.restoreNavigationViewport).toHaveBeenCalledOnce()
    expect(returned.scrollToPlaybackTrack).not.toHaveBeenCalled()
    expect(returned.loader.isPositioningForegroundViewport.value).toBe(false)
    returned.dispose()
  })

  it('keeps a pending saved position through an empty return and restores on the next populated snapshot', async () => {
    const getTrackPage = vi
      .fn()
      .mockResolvedValueOnce(createPage([]))
      .mockResolvedValueOnce(createPage([createTrack(1)]))
    const returned = createLoader({ getTrackPage, restoreNavigationViewport: async () => true })
    await returned.loader.loadLibraryData('foreground')
    await returned.loader.loadLibraryData('background')
    expect(returned.restoreNavigationViewport).toHaveBeenCalledTimes(2)
    expect(returned.restoreViewportRestore).not.toHaveBeenCalled()
    expect(returned.scrollToPlaybackTrack).not.toHaveBeenCalled()
    returned.dispose()
  })

  it('skips stale restoration after unmount while layout preparation is pending', async () => {
    const ready = deferred<void>()
    const returned = createLoader({ prepareForegroundViewport: () => ready.promise })
    const pending = returned.loader.loadLibraryData('foreground')
    await vi.waitFor(() => expect(returned.prepareForegroundViewport).toHaveBeenCalledOnce())
    returned.dispose()
    ready.resolve()
    expect(await pending).toBe('stale')
    expect(returned.restoreNavigationViewport).not.toHaveBeenCalled()
    expect(returned.scrollToPlaybackTrack).not.toHaveBeenCalled()
  })

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

  it.each(['track-added', 'track-missing', 'metadata-refresh', 'scan-completed'])(
    'reconciles %s captured while the first snapshot is loading',
    async (reason) => {
      vi.useFakeTimers()
      const gate = deferred<LibraryTrackPage>()
      const getTrackPage = vi
        .fn()
        .mockImplementationOnce(() => gate.promise)
        .mockResolvedValue(createPage([createTrack(2)]))
      const returned = createLoader({ getTrackPage })
      returned.loader.subscribeLibraryEvents()
      const foreground = returned.loader.loadLibraryData('foreground')
      if (reason === 'scan-completed') await returned.emitScanCompleted()
      else await returned.emitLibraryChanged(reason)
      gate.resolve(createPage([]))
      await foreground
      await vi.advanceTimersByTimeAsync(5000)
      expect(returned.tracks.value.map((track) => track.id)).toEqual([2])
      expect(returned.loader.initialLoadError.value).toBeNull()
      returned.dispose()
    },
  )

  it('subscribes once and cannot reattach or commit after disposal during the initial load', async () => {
    const gate = deferred<LibraryTrackPage>()
    const returned = createLoader({ getTrackPage: () => gate.promise })
    returned.loader.subscribeLibraryEvents()
    returned.loader.subscribeLibraryEvents()
    const foreground = returned.loader.loadLibraryData('foreground')
    returned.dispose()
    returned.loader.subscribeLibraryEvents()
    gate.resolve(createPage([createTrack(1)]))
    expect(await foreground).toBe('stale')
    expect(returned.subscribeChanged).toHaveBeenCalledOnce()
    expect(returned.subscribeScan).toHaveBeenCalledOnce()
    expect(returned.onSnapshotCommitted).not.toHaveBeenCalled()
    await returned.emitLibraryChanged('metadata-refresh')
    await returned.emitScanCompleted()
    expect(returned.onSnapshotCommitted).not.toHaveBeenCalled()
  })

  it.each(['track-added', 'track-relocated'])(
    'publishes complete snapshots during slow continuous %s and converges after imports stop',
    async (reason) => {
      vi.useFakeTimers()
      let source = [createTrack(1)]
      const store = new LibraryCatalogSnapshotStore(() => source)
      const returned = createLoader({
        getTrackPage: async (request) => {
          const page = store.getPage(request)
          await new Promise((resolve) => setTimeout(resolve, 1800))
          return page
        },
      })
      const first = returned.loader.loadLibraryData('foreground')
      await vi.advanceTimersByTimeAsync(1800)
      await first
      returned.loader.subscribeLibraryEvents()
      source = Array.from({ length: 5001 }, (_, i) => createTrack(i + 1))
      for (let i = 0; i < 60; i += 1) {
        source = [...source, createTrack(5002 + i)]
        await returned.emitLibraryChanged(reason)
        await vi.advanceTimersByTimeAsync(500)
      }
      expect(returned.onSnapshotCommitted.mock.calls.length).toBeGreaterThan(2)
      expect(returned.tracks.value.length).toBeGreaterThan(5000)
      for (const [snapshot] of returned.onSnapshotCommitted.mock.calls) {
        expect(snapshot.tracks.map((track: TrackListItem) => track.id)).toEqual(
          Array.from({ length: snapshot.tracks.length }, (_, i) => i + 1),
        )
      }
      await vi.advanceTimersByTimeAsync(15000)
      expect(returned.tracks.value.map((track) => track.id)).toEqual(
        source.map((track) => track.id),
      )
      expect(returned.loader.initialLoadError.value).toBeNull()
      returned.dispose()
    },
  )

  it.each(['track-missing', 'metadata-refresh'])(
    'does not publish pre-change data after %s invalidates a slow import snapshot',
    async (reason) => {
      const gate = deferred<LibraryTrackPage>()
      let source = [createTrack(1), createTrack(2)]
      const getTrackPage = vi
        .fn()
        .mockImplementationOnce(() => gate.promise)
        .mockImplementation(async () => createPage(source))
      const returned = createLoader({ getTrackPage })
      returned.loader.subscribeLibraryEvents()
      const foreground = returned.loader.loadLibraryData('foreground')
      source =
        reason === 'track-missing'
          ? [createTrack(1)]
          : [{ ...createTrack(1), title: 'Edited' }, createTrack(2)]
      await returned.emitLibraryChanged(reason)
      gate.resolve(createPage([createTrack(1), createTrack(2)]))
      expect(await foreground).toBe('committed')
      await vi.waitFor(() => expect(returned.onSnapshotCommitted).toHaveBeenCalledTimes(2))
      for (const [snapshot] of returned.onSnapshotCommitted.mock.calls) {
        expect(snapshot.tracks).toEqual(source)
      }
      returned.dispose()
    },
  )

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
