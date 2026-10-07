import { computed, ref, shallowRef } from 'vue'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import type {
  TrackEditStateChangedEvent,
  TrackEditStateResult,
  TrackEditStatus,
  UpdateTrackMetadataResult,
} from '@shared/ipc/contracts'
import type { LibraryContextMenuSource } from '../types/libraryInteraction'
import { isSameLibraryRouteScope, type LibraryRouteScope } from '../utils/libraryRouteScope'

export type LibraryMetadataRefreshResult =
  | 'committed'
  | 'stale'
  | 'redirected'
  | 'failed'
  | 'queued'

export interface LibraryMetadataFocusTarget {
  trackId: number
  source: LibraryContextMenuSource
  openReason?: 'pointer' | 'keyboard'
}

export type MetadataEditStatus = 'checking' | TrackEditStatus | 'query-failed'

interface UseLibraryMetadataEditorOptions {
  loadTrackMetadata: (trackId: number) => Promise<EditableTrackMetadata | null>
  updateTrackMetadata: (
    metadata: EditableTrackMetadata,
  ) => Promise<UpdateTrackMetadataResult | unknown>
  captureRouteScope: () => LibraryRouteScope
  refreshLibrary: () => Promise<LibraryMetadataRefreshResult>
  restoreFocus: (target: LibraryMetadataFocusTarget) => Promise<void>
  isDisposed: () => boolean
  getSaveErrorMessage: () => string
  getSaveFailureMessage?: (reason: string) => string
  getLoadErrorMessage?: () => string
  getPlaybackInUseMessage?: () => string
  getQueryFailedMessage?: () => string
  getTrackEditState?: (trackId: number) => Promise<TrackEditStateResult>
  onTrackEditStateChanged?: (callback: (event: TrackEditStateChangedEvent) => void) => () => void
  logSaveError?: (error: unknown) => void
  logLoadError?: (error: unknown) => void
}

export function useLibraryMetadataEditor(options: UseLibraryMetadataEditorOptions) {
  const editingMetadata = ref<EditableTrackMetadata | null>(null)
  const isMetadataEditorOpen = ref(false)
  const isLoadingMetadata = ref(false)
  const isSavingMetadata = ref(false)
  const errorMessageSource = shallowRef<(() => string) | null>(null)
  const metadataEditError = computed(() => errorMessageSource.value?.() ?? null)
  const editStatus = ref<MetadataEditStatus>('checking')

  let currentTrackId: number | null = null
  let currentVersion = 0
  let unsubscribeStatus: (() => void) | null = null
  let pendingReturnTarget: LibraryMetadataFocusTarget | null = null
  let loadRevision = 0

  function isCurrentLoad(trackId: number, revision: number): boolean {
    return !options.isDisposed() && currentTrackId === trackId && loadRevision === revision
  }

  function setReturnTarget(target: LibraryMetadataFocusTarget): void {
    pendingReturnTarget = target
  }

  async function checkStatus(targetTrackId: number, revision = loadRevision): Promise<void> {
    if (!options.getTrackEditState) {
      editStatus.value = 'editable'
      return
    }

    try {
      const result = await options.getTrackEditState(targetTrackId)
      if (!isCurrentLoad(targetTrackId, revision)) return
      if (result.version >= currentVersion) {
        currentVersion = result.version
        editStatus.value = result.status
      }
    } catch {
      if (!isCurrentLoad(targetTrackId, revision)) return
      if (currentVersion === 0) {
        editStatus.value = 'query-failed'
      }
    }
  }

  async function retryCheckStatus(): Promise<void> {
    if (currentTrackId === null || options.isDisposed()) return
    editStatus.value = 'checking'
    await checkStatus(currentTrackId)
  }

  async function open(trackId: number): Promise<void> {
    if (options.isDisposed() || isSavingMetadata.value) return
    const revision = ++loadRevision
    if (unsubscribeStatus) {
      unsubscribeStatus()
      unsubscribeStatus = null
    }

    currentTrackId = trackId
    isMetadataEditorOpen.value = true
    isLoadingMetadata.value = true
    editingMetadata.value = null
    currentVersion = 0
    editStatus.value = options.getTrackEditState ? 'checking' : 'editable'
    errorMessageSource.value = null

    if (options.onTrackEditStateChanged) {
      unsubscribeStatus = options.onTrackEditStateChanged((event) => {
        if (event.trackId !== trackId || !isCurrentLoad(trackId, revision)) return
        if (event.version < currentVersion) return
        currentVersion = event.version
        editStatus.value = event.status
      })
    }

    try {
      const [metadata] = await Promise.all([
        options.loadTrackMetadata(trackId),
        checkStatus(trackId, revision),
      ])
      if (!isCurrentLoad(trackId, revision)) return
      if (!metadata) throw new Error('Track metadata is unavailable')
      editingMetadata.value = metadata
    } catch (error) {
      if (!isCurrentLoad(trackId, revision)) return
      options.logLoadError?.(error)
      errorMessageSource.value =
        options.getLoadErrorMessage ?? options.getQueryFailedMessage ?? options.getSaveErrorMessage
    } finally {
      if (isCurrentLoad(trackId, revision)) isLoadingMetadata.value = false
    }
  }

  async function retryLoad(): Promise<void> {
    if (currentTrackId === null || isLoadingMetadata.value) return
    await open(currentTrackId)
  }

  function close(): void {
    if (isSavingMetadata.value) return
    const trackId = currentTrackId
    loadRevision++
    isMetadataEditorOpen.value = false
    isLoadingMetadata.value = false

    if (unsubscribeStatus) {
      unsubscribeStatus()
      unsubscribeStatus = null
    }
    currentTrackId = null
    currentVersion = 0
    editStatus.value = 'checking'

    const returnTarget =
      pendingReturnTarget ?? (trackId !== null ? { trackId, source: 'track' as const } : null)

    editingMetadata.value = null
    errorMessageSource.value = null
    pendingReturnTarget = null

    if (returnTarget) {
      void options.restoreFocus(returnTarget)
    }
  }

  function dispose(): void {
    loadRevision++
    isMetadataEditorOpen.value = false
    isLoadingMetadata.value = false
    editingMetadata.value = null
    errorMessageSource.value = null
    pendingReturnTarget = null
    if (unsubscribeStatus) {
      unsubscribeStatus()
      unsubscribeStatus = null
    }
    currentTrackId = null
    currentVersion = 0
  }

  async function save(metadata: EditableTrackMetadata): Promise<void> {
    if (
      isSavingMetadata.value ||
      !['editable', 'playback-editable'].includes(editStatus.value) ||
      !editingMetadata.value ||
      currentTrackId !== metadata.trackId
    ) {
      return
    }

    isSavingMetadata.value = true
    errorMessageSource.value = null
    const saveScope = options.captureRouteScope()

    try {
      const saveResult = await options.updateTrackMetadata(metadata)
      if (options.isDisposed()) return

      if (
        saveResult &&
        typeof saveResult === 'object' &&
        'ok' in saveResult &&
        (saveResult as { ok: boolean }).ok === false
      ) {
        const rejected = saveResult as { ok: false; reason: string }
        if (rejected.reason === 'playback-in-use') {
          editStatus.value = 'playback-in-use'
          errorMessageSource.value = options.getPlaybackInUseMessage ?? options.getSaveErrorMessage
        } else if (rejected.reason === 'write-in-progress') {
          editStatus.value = 'write-in-progress'
          errorMessageSource.value = options.getSaveErrorMessage
        } else {
          errorMessageSource.value = options.getSaveFailureMessage
            ? () => options.getSaveFailureMessage!(rejected.reason)
            : options.getSaveErrorMessage
        }
        return
      }

      const returnTarget = pendingReturnTarget ?? {
        trackId: metadata.trackId,
        source: 'track' as const,
      }
      const loadResult = await options.refreshLibrary()
      const isStillInSaveScope = isSameLibraryRouteScope(saveScope, options.captureRouteScope())

      if (loadResult === 'failed' || loadResult === 'queued') {
        throw new Error('Metadata refresh after save failed')
      }
      if (loadResult === 'stale' && isStillInSaveScope) {
        throw new Error('Metadata refresh after save became stale')
      }
      if (options.isDisposed()) return

      if (unsubscribeStatus) {
        unsubscribeStatus()
        unsubscribeStatus = null
      }
      currentTrackId = null
      currentVersion = 0
      loadRevision++
      isMetadataEditorOpen.value = false
      editingMetadata.value = null
      pendingReturnTarget = null

      if (isStillInSaveScope) {
        await options.restoreFocus(returnTarget)
      }
    } catch (error) {
      options.logSaveError?.(error)
      if (!options.isDisposed()) {
        errorMessageSource.value = options.getSaveErrorMessage
      }
    } finally {
      if (!options.isDisposed()) {
        isSavingMetadata.value = false
      }
    }
  }

  return {
    editingMetadata,
    isMetadataEditorOpen,
    isLoadingMetadata,
    isSavingMetadata,
    metadataEditError,
    editStatus,
    setReturnTarget,
    open,
    close,
    save,
    retryCheckStatus,
    retryLoad,
    dispose,
  }
}
