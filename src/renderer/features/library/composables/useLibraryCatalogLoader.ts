import { ref, type Ref } from 'vue'
import type {
  LibraryTrackPageResponse,
  LibraryTrackPageRequest,
} from '@shared/types/libraryCatalog'
import type { TrackListItem, LibraryScanProgress } from '@shared/types/libraryScan'
import type { PlaylistDetail } from '@shared/types/playlist'
import type { SmartPlaylistDetail } from '@shared/types/smartPlaylist'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import type { LibraryViewMode } from '../types/libraryInteraction'
import type { LibraryPageIdentity } from '../types/libraryPageIdentity'
import type { LibraryMetadataRefreshResult } from './useLibraryMetadataEditor'
import type { LibraryViewportCapture } from './useLibraryViewport'
import {
  createAllSongsLibrarySnapshot,
  createPlaylistLibrarySnapshot,
  createSmartPlaylistLibrarySnapshot,
  type LibraryDataSnapshot,
} from '../utils/libraryDataSnapshot'
import { SharedLibraryCatalogLoad } from '../utils/sharedLibraryCatalogLoad'
import { LibraryRequestCoordinator, type LibraryLoadMode } from '../utils/libraryRequestCoordinator'
import {
  LIBRARY_PLAYLISTS_CHANGED_EVENT,
  LIBRARY_SMART_PLAYLISTS_CHANGED_EVENT,
  isSameLibraryRouteScope,
  shouldRefreshLibraryForExternalPlaylistEvent,
  type LibraryRouteScope,
} from '../utils/libraryRouteScope'

export type LibraryLoadResult = LibraryMetadataRefreshResult

export function useLibraryCatalogLoader(options: {
  isDisposed: () => boolean
  captureRouteScope: () => LibraryRouteScope
  pageIdentity: Ref<LibraryPageIdentity | null>
  tracks: { value: TrackListItem[] }
  libraryViewMode: Ref<LibraryViewMode>
  isLoading: Ref<boolean>
  getTrackPage: (request: LibraryTrackPageRequest) => Promise<LibraryTrackPageResponse>
  catalogClient?: SharedLibraryCatalogLoad
  getPlaylistDetail: (id: number) => Promise<PlaylistDetail | null>
  getSmartPlaylistDetail: (id: number) => Promise<SmartPlaylistDetail | null>
  readPersistedViewMode: () => LibraryViewMode
  onSnapshotCommitted: (snapshot: LibraryDataSnapshot) => void
  captureViewportRestore: () => LibraryViewportCapture
  restoreViewportRestore: (
    capture: LibraryViewportCapture,
    isRequestCurrent: () => boolean,
  ) => Promise<void>
  scrollToPlaybackTrack: (isRequestCurrent?: () => boolean) => Promise<void>
  replaceWithLibraryHome: () => Promise<unknown>
  loadErrorMessage: () => string
  onLibraryChanged: (
    callback: (event: {
      reason:
        | 'track-added'
        | 'track-missing'
        | 'track-restored'
        | 'track-relocated'
        | 'metadata-refresh'
        | 'file-change'
        | 'play-stats-updated'
        | 'play-stats-reset'
        | string
    }) => void | Promise<void>,
  ) => () => void
  onScanProgress: (callback: (progress: LibraryScanProgress) => void | Promise<void>) => () => void
}) {
  const coordinator = new LibraryRequestCoordinator()
  const catalogClient = options.catalogClient ?? new SharedLibraryCatalogLoad(options.getTrackPage)
  const initialLoadError = ref<string | null>(null)
  let committedScope: LibraryRouteScope | null = null
  let unsubscribeChanged: (() => void) | null = null
  let unsubscribeScanProgress: (() => void) | null = null
  let importRefreshTimer: ReturnType<typeof setTimeout> | null = null
  let importRefreshDeadline: ReturnType<typeof setTimeout> | null = null

  function clearImportRefresh(): void {
    if (importRefreshTimer !== null) clearTimeout(importRefreshTimer)
    if (importRefreshDeadline !== null) clearTimeout(importRefreshDeadline)
    importRefreshTimer = null
    importRefreshDeadline = null
  }

  function flushImportRefresh(): void {
    clearImportRefresh()
    if (options.isDisposed()) return
    catalogClient.invalidate()
    void loadLibraryData('background')
  }

  function scheduleImportRefresh(): void {
    if (importRefreshTimer !== null) clearTimeout(importRefreshTimer)
    importRefreshTimer = setTimeout(flushImportRefresh, 1000)
    // Continuous imports must still become visible without waiting for the last file.
    importRefreshDeadline ??= setTimeout(flushImportRefresh, 3000)
  }

  function isCurrentLibraryRequest(generation: number, scope: LibraryRouteScope): boolean {
    return (
      !options.isDisposed() &&
      coordinator.isLatest(generation) &&
      isSameLibraryRouteScope(scope, options.captureRouteScope())
    )
  }

  async function fetchLibrarySnapshot(
    scope: LibraryRouteScope,
    isRequestCurrent: () => boolean,
  ): Promise<LibraryDataSnapshot | null> {
    if (scope.kind === 'smart-playlist') {
      const detail = await options.getSmartPlaylistDetail(scope.id)
      if (!detail) return null
      return createSmartPlaylistLibrarySnapshot(detail)
    }

    if (scope.kind === 'playlist') {
      const detail = await options.getPlaylistDetail(scope.id)
      if (!detail) return null
      return createPlaylistLibrarySnapshot(detail)
    }

    const catalog = await catalogClient.load(isRequestCurrent)
    if (import.meta.env.DEV) {
      rendererDiagnostics.info({
        scope: 'library.catalog',
        message: 'Library catalog snapshot loaded',
        context: {
          totalTracks: catalog.tracks.length,
          totalPages: catalog.totalPages,
          snapshotBuildMs: catalog.snapshotBuildMs,
          snapshotHeapDeltaBytes: catalog.snapshotHeapDeltaBytes,
          pageSliceMs: catalog.pageSliceMs,
          pageRoundTripMs: catalog.pageRoundTripMs,
          rendererAggregateMs: catalog.rendererAggregateMs,
          rendererLoadMs: catalog.rendererLoadMs,
          rendererHeapDeltaBytes: catalog.rendererHeapDeltaBytes,
        },
      })
    }
    return createAllSongsLibrarySnapshot([...catalog.tracks], options.readPersistedViewMode())
  }

  function commitLibrarySnapshot(snapshot: LibraryDataSnapshot): void {
    options.pageIdentity.value = snapshot.identity
    options.tracks.value = snapshot.tracks
    options.libraryViewMode.value = snapshot.viewMode
    options.onSnapshotCommitted(snapshot)
  }

  async function loadLibraryData(mode: LibraryLoadMode = 'foreground'): Promise<LibraryLoadResult> {
    if (mode === 'metadata-save') {
      while (coordinator.hasActiveForeground && !options.isDisposed()) {
        await coordinator.waitForForegroundIdle()
      }

      if (options.isDisposed()) return 'stale'
      catalogClient.invalidate()
    }

    const scope = options.captureRouteScope()
    const generation = coordinator.begin(mode)
    if (generation === null) {
      return mode === 'background' ? 'queued' : 'stale'
    }
    const isRequestCurrent = () => isCurrentLibraryRequest(generation, scope)
    const isForeground = mode === 'foreground'
    const hasPreviousSnapshot =
      committedScope !== null && isSameLibraryRouteScope(committedScope, scope)
    const viewportCapture = isForeground ? null : options.captureViewportRestore()

    if (isForeground && isRequestCurrent()) {
      options.isLoading.value = !hasPreviousSnapshot
      initialLoadError.value = null
      if (!hasPreviousSnapshot) options.pageIdentity.value = null
    }

    try {
      const snapshot = await fetchLibrarySnapshot(scope, isRequestCurrent)
      if (!isRequestCurrent()) return 'stale'

      if (snapshot === null) {
        await options.replaceWithLibraryHome()
        return 'redirected'
      }

      commitLibrarySnapshot(snapshot)
      committedScope = scope
      initialLoadError.value = null

      if (viewportCapture) {
        await options.restoreViewportRestore(viewportCapture, isRequestCurrent)
      } else {
        await options.scrollToPlaybackTrack(isRequestCurrent)
      }

      return isRequestCurrent() ? 'committed' : 'stale'
    } catch (error) {
      if (!isRequestCurrent()) return 'stale'
      initialLoadError.value = options.loadErrorMessage()

      if (isForeground) {
        rendererDiagnostics.error({
          scope: 'library.catalog',
          message: 'Initial library load failed',
          cause: error,
        })
        initialLoadError.value = options.loadErrorMessage()
      } else {
        rendererDiagnostics.error({
          scope: 'library.catalog',
          message: 'Background library refresh failed',
          cause: error,
        })
      }

      return 'failed'
    } finally {
      const completion = coordinator.finish(generation)

      if (completion.ownedForeground) {
        if (!options.isDisposed() && isRequestCurrent()) {
          options.isLoading.value = false
        }
      }

      if (completion.shouldFlushBackground) {
        void loadLibraryData('background')
      }
    }
  }

  async function retryInitialLoad(): Promise<void> {
    catalogClient.invalidate()
    await loadLibraryData('foreground')
  }

  function onExternalPlaylistCollectionChanged(eventName: string): void {
    if (options.isDisposed()) return
    if (!shouldRefreshLibraryForExternalPlaylistEvent(options.captureRouteScope(), eventName)) {
      return
    }
    void loadLibraryData('background')
  }

  function onPlaylistsChanged(): void {
    onExternalPlaylistCollectionChanged(LIBRARY_PLAYLISTS_CHANGED_EVENT)
  }

  function onSmartPlaylistsChanged(): void {
    onExternalPlaylistCollectionChanged(LIBRARY_SMART_PLAYLISTS_CHANGED_EVENT)
  }

  function bindExternalPlaylistEvents(): void {
    if (typeof window === 'undefined') return
    window.addEventListener(LIBRARY_PLAYLISTS_CHANGED_EVENT, onPlaylistsChanged)
    window.addEventListener(LIBRARY_SMART_PLAYLISTS_CHANGED_EVENT, onSmartPlaylistsChanged)
  }

  function subscribeLibraryEvents(): void {
    unsubscribeChanged = options.onLibraryChanged(async (event) => {
      if (event.reason === 'play-stats-updated' || event.reason === 'play-stats-reset') return
      if (options.isDisposed()) return
      if (event.reason === 'track-added' || event.reason === 'track-relocated') {
        scheduleImportRefresh()
        return
      }
      clearImportRefresh()
      catalogClient.invalidate()
      await loadLibraryData('background')
    })

    unsubscribeScanProgress = options.onScanProgress(async (progress) => {
      if (progress.status === 'completed') {
        clearImportRefresh()
        catalogClient.invalidate()
        await loadLibraryData('background')
      }
    })
  }

  function dispose(): void {
    clearImportRefresh()
    coordinator.invalidate()
    unsubscribeChanged?.()
    unsubscribeScanProgress?.()
    unsubscribeChanged = null
    unsubscribeScanProgress = null
    if (typeof window !== 'undefined') {
      window.removeEventListener(LIBRARY_PLAYLISTS_CHANGED_EVENT, onPlaylistsChanged)
      window.removeEventListener(LIBRARY_SMART_PLAYLISTS_CHANGED_EVENT, onSmartPlaylistsChanged)
    }
  }

  return {
    initialLoadError,
    loadLibraryData,
    retryInitialLoad,
    bindExternalPlaylistEvents,
    subscribeLibraryEvents,
    dispose,
  }
}
