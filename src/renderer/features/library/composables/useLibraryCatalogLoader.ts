import type { Ref } from 'vue'
import type {
  LibraryTrackPageResponse,
  LibraryTrackPageRequest,
} from '@shared/types/libraryCatalog'
import type { TrackListItem, LibraryScanProgress } from '@shared/types/libraryScan'
import type { PlaylistChangedEvent } from '@shared/types/playlistEvents'
import type { PlaylistDetail } from '@shared/types/playlist'
import type { SmartPlaylistDetail } from '@shared/types/smartPlaylist'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { createLibrarySnapshotLoader, dependsOnPlayStats } from '../utils/librarySnapshotLoader'
import { useLibrarySnapshotPresentation } from './useLibrarySnapshotPresentation'
import type { LibraryViewMode } from '../types/libraryInteraction'
import type { LibraryPageIdentity } from '../types/libraryPageIdentity'
import type { LibraryMetadataRefreshResult } from './useLibraryMetadataEditor'
import type { LibraryViewportCapture } from './useLibraryViewport'
import type { LibraryDataSnapshot } from '../utils/libraryDataSnapshot'
import { SharedLibraryCatalogLoad } from '../utils/sharedLibraryCatalogLoad'
import { LibraryRequestCoordinator, type LibraryLoadMode } from '../utils/libraryRequestCoordinator'
import {
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
  prepareForegroundViewport?: (isRequestCurrent: () => boolean) => Promise<void>
  restoreNavigationViewport?: (isRequestCurrent: () => boolean) => Promise<boolean>
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
      libraryRevision?: string
    }) => void | Promise<void>,
  ) => () => void
  onPlaylistChanged: (callback: (event: PlaylistChangedEvent) => void) => () => void
  onScanProgress: (callback: (progress: LibraryScanProgress) => void | Promise<void>) => () => void
}) {
  const coordinator = new LibraryRequestCoordinator()
  const catalogClient = options.catalogClient ?? new SharedLibraryCatalogLoad(options.getTrackPage)
  const presentation = useLibrarySnapshotPresentation(options)
  const {
    hasInitialLoadError,
    isPositioningForegroundViewport,
    initialLoadError,
    commitLibrarySnapshot,
  } = presentation
  let unsubscribePlaylistsChanged: (() => void) | null = null
  let unsubscribeChanged: (() => void) | null = null
  let unsubscribeScanProgress: (() => void) | null = null
  let importRefreshTimer: ReturnType<typeof setTimeout> | null = null
  let importRefreshDeadline: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  let playStatsRevision = 0
  let revisionRefresh: {
    revision: string
    scope: LibraryRouteScope
    catalogRevision: number
    isCurrent: () => boolean
    promise: Promise<LibraryLoadResult>
  } | null = null

  const { fetchLibrarySnapshot } = createLibrarySnapshotLoader({
    catalogClient,
    getSmartPlaylistDetail: options.getSmartPlaylistDetail,
    getPlaylistDetail: options.getPlaylistDetail,
    readPersistedViewMode: options.readPersistedViewMode,
    getPlayStatsRevision: () => playStatsRevision,
    requestBackgroundRefresh: () => {
      void loadLibraryData('background')
    },
  })

  function isDisposed(): boolean {
    return disposed || options.isDisposed()
  }

  function clearImportRefresh(): void {
    if (importRefreshTimer !== null) clearTimeout(importRefreshTimer)
    if (importRefreshDeadline !== null) clearTimeout(importRefreshDeadline)
    importRefreshTimer = null
    importRefreshDeadline = null
  }

  function flushImportRefresh(): void {
    clearImportRefresh()
    if (isDisposed()) return
    if (!catalogClient.observesChanges) catalogClient.invalidate('import')
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
      !isDisposed() &&
      coordinator.isLatest(generation) &&
      isSameLibraryRouteScope(scope, options.captureRouteScope())
    )
  }

  async function loadLibraryData(
    mode: LibraryLoadMode = 'foreground',
    libraryRevision?: string,
  ): Promise<LibraryLoadResult> {
    if (isDisposed()) return 'stale'
    if (!libraryRevision) return executeLibraryLoad(mode)

    catalogClient.invalidateForLibraryRevision(libraryRevision)
    const scope = options.captureRouteScope()
    const existing = revisionRefresh
    if (
      existing?.revision === libraryRevision &&
      isSameLibraryRouteScope(existing.scope, scope) &&
      existing.catalogRevision === catalogClient.invalidationRevision &&
      existing.isCurrent()
    ) {
      const result = await existing.promise
      if (
        result === 'committed' &&
        existing.isCurrent() &&
        existing.catalogRevision === catalogClient.invalidationRevision &&
        catalogClient.isLibraryRevisionCurrent(libraryRevision)
      )
        return result
      // Failed/queued/stale refreshes must not satisfy a successful save.
      if (isDisposed()) return 'stale'
    }

    const refresh = {
      revision: libraryRevision,
      scope,
      catalogRevision: catalogClient.invalidationRevision,
      isCurrent: () => false,
      promise: Promise.resolve<LibraryLoadResult>('stale'),
    }
    revisionRefresh = refresh
    refresh.promise = executeLibraryLoad(mode, libraryRevision, (isCurrent) => {
      refresh.isCurrent = isCurrent
      refresh.catalogRevision = catalogClient.invalidationRevision
      if (catalogClient.isLibraryRevisionCurrent(libraryRevision)) revisionRefresh = refresh
    })
    return refresh.promise
  }

  async function executeLibraryLoad(
    mode: LibraryLoadMode,
    libraryRevision?: string,
    onRequestStarted?: (isCurrent: () => boolean) => void,
  ): Promise<LibraryLoadResult> {
    if (isDisposed()) return 'stale'
    if (mode === 'metadata-save') {
      while (coordinator.hasActiveForeground && !isDisposed()) {
        await coordinator.waitForForegroundIdle()
      }

      if (isDisposed()) return 'stale'
      if (libraryRevision) catalogClient.invalidateForLibraryRevision(libraryRevision)
      else catalogClient.invalidate()
    }

    const scope = options.captureRouteScope()
    const generation = coordinator.begin(mode)
    if (generation === null) {
      return mode === 'background' ? 'queued' : 'stale'
    }
    const isRequestCurrent = () => isCurrentLibraryRequest(generation, scope)
    onRequestStarted?.(isRequestCurrent)
    const isForeground = mode === 'foreground'
    const hasPreviousSnapshot = presentation.hasPreviousSnapshot(scope)
    const viewportCapture =
      isForeground && !hasPreviousSnapshot ? null : options.captureViewportRestore()

    if (isForeground && isRequestCurrent()) {
      isPositioningForegroundViewport.value = !hasPreviousSnapshot
      options.isLoading.value = !hasPreviousSnapshot
      hasInitialLoadError.value = false
      if (!hasPreviousSnapshot) options.pageIdentity.value = null
    }

    try {
      const { snapshot, isSnapshotCurrent } = await fetchLibrarySnapshot(
        scope,
        isRequestCurrent,
        mode,
        libraryRevision,
      )
      if (!isRequestCurrent()) return 'stale'
      // An event may arrive between the shared load resolving and this consumer
      // resuming. Its queued refresh will reconcile without committing old data.
      if (!isSnapshotCurrent()) return 'stale'

      if (snapshot === null) {
        await options.replaceWithLibraryHome()
        return 'redirected'
      }

      if (isForeground) isPositioningForegroundViewport.value = true
      commitLibrarySnapshot(snapshot)
      presentation.recordCommittedScope(scope)
      hasInitialLoadError.value = false

      // Mount the real scroll container before positioning it. Keep its first
      // render hidden until both layout and navigation restoration are ready.
      if (isForeground) {
        options.isLoading.value = false
        await options.prepareForegroundViewport?.(isRequestCurrent)
        if (!isRequestCurrent()) return 'stale'
      }
      const restoredNavigation = await options.restoreNavigationViewport?.(isRequestCurrent)
      if (!isRequestCurrent()) return 'stale'
      if (!restoredNavigation) {
        if (viewportCapture) {
          await options.restoreViewportRestore(viewportCapture, isRequestCurrent)
        } else {
          await options.scrollToPlaybackTrack(isRequestCurrent)
        }
      }

      return isRequestCurrent() ? 'committed' : 'stale'
    } catch (error) {
      if (!isRequestCurrent()) return 'stale'
      hasInitialLoadError.value = true

      if (isForeground) {
        rendererDiagnostics.error({
          scope: 'library.catalog',
          message: 'Initial library load failed',
          cause: error,
        })
        hasInitialLoadError.value = true
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
        isPositioningForegroundViewport.value = false
        if (!isDisposed() && isRequestCurrent()) {
          options.isLoading.value = false
        }
      }

      if (completion.shouldFlushBackground) {
        void loadLibraryData('background')
      }
    }
  }

  async function retryInitialLoad(): Promise<void> {
    if (isDisposed()) return
    catalogClient.invalidate()
    await loadLibraryData('foreground')
  }

  function bindExternalPlaylistEvents(): void {
    if (isDisposed() || unsubscribePlaylistsChanged) return
    unsubscribePlaylistsChanged = options.onPlaylistChanged((event) => {
      if (
        isDisposed() ||
        !shouldRefreshLibraryForExternalPlaylistEvent(options.captureRouteScope(), event)
      )
        return
      void loadLibraryData('background')
    })
  }

  function subscribeLibraryEvents(): void {
    if (isDisposed() || unsubscribeChanged || unsubscribeScanProgress) return
    unsubscribeChanged = options.onLibraryChanged(async (event) => {
      if (isDisposed()) return
      if (event.reason === 'play-stats-updated' || event.reason === 'play-stats-reset') {
        playStatsRevision += 1
        if (!catalogClient.observesChanges) catalogClient.invalidate('import')
        const scope = options.captureRouteScope()
        const identity = options.pageIdentity.value
        if (
          scope.kind === 'smart-playlist' &&
          identity?.kind === 'smart-playlist' &&
          identity.id === scope.id &&
          dependsOnPlayStats(identity.preset)
        ) {
          await loadLibraryData('background')
        }
        return
      }
      if (event.reason === 'track-added' || event.reason === 'track-relocated') {
        scheduleImportRefresh()
        return
      }
      clearImportRefresh()
      if (event.libraryRevision) {
        await loadLibraryData('background', event.libraryRevision)
        return
      }
      if (!catalogClient.observesChanges) catalogClient.invalidate()
      await loadLibraryData('background')
    })

    unsubscribeScanProgress = options.onScanProgress(async (progress) => {
      if (isDisposed()) return
      if (progress.status === 'completed') {
        clearImportRefresh()
        if (!catalogClient.observesChanges) catalogClient.invalidate()
        await loadLibraryData('background')
      }
    })
  }

  function dispose(): void {
    disposed = true
    revisionRefresh = null
    clearImportRefresh()
    coordinator.invalidate()
    unsubscribeChanged?.()
    unsubscribeScanProgress?.()
    unsubscribeChanged = null
    unsubscribeScanProgress = null
    unsubscribePlaylistsChanged?.()
    unsubscribePlaylistsChanged = null
  }

  return {
    isPositioningForegroundViewport,
    initialLoadError,
    loadLibraryData,
    retryInitialLoad,
    bindExternalPlaylistEvents,
    subscribeLibraryEvents,
    dispose,
  }
}
