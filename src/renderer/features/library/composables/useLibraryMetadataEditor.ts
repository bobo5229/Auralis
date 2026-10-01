import { ref } from 'vue'
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
  getPlaybackInUseMessage?: () => string
  getQueryFailedMessage?: () => string
  getTrackEditState?: (trackId: number) => Promise<TrackEditStateResult>
  onTrackEditStateChanged?: (callback: (event: TrackEditStateChangedEvent) => void) => () => void
  logSaveError?: (error: unknown) => void
}

export function useLibraryMetadataEditor(options: UseLibraryMetadataEditorOptions) {
  const editingMetadata = ref<EditableTrackMetadata | null>(null)
  const isSavingMetadata = ref(false)
  const metadataEditError = ref<string | null>(null)
  const editStatus = ref<MetadataEditStatus>('checking')

  let currentTrackId: number | null = null
  let currentVersion = 0
  let unsubscribeStatus: (() => void) | null = null
  let pendingReturnTarget: LibraryMetadataFocusTarget | null = null

  function setReturnTarget(target: LibraryMetadataFocusTarget): void {
    pendingReturnTarget = target
  }

  async function checkStatus(targetTrackId: number): Promise<void> {
    if (!options.getTrackEditState) {
      editStatus.value = 'editable'
      return
    }

    try {
      const result = await options.getTrackEditState(targetTrackId)
      if (options.isDisposed() || currentTrackId !== targetTrackId) return
      if (result.version >= currentVersion) {
        currentVersion = result.version
        editStatus.value = result.status
      }
    } catch {
      if (options.isDisposed() || currentTrackId !== targetTrackId) return
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
    if (unsubscribeStatus) {
      unsubscribeStatus()
      unsubscribeStatus = null
    }

    currentTrackId = trackId
    currentVersion = 0
    editStatus.value = options.getTrackEditState ? 'checking' : 'editable'
    metadataEditError.value = null

    if (options.onTrackEditStateChanged) {
      unsubscribeStatus = options.onTrackEditStateChanged((event) => {
        if (options.isDisposed() || currentTrackId !== event.trackId) return
        if (event.version < currentVersion) return
        currentVersion = event.version
        editStatus.value = event.status
      })
    }

    const [metadata] = await Promise.all([options.loadTrackMetadata(trackId), checkStatus(trackId)])

    if (options.isDisposed() || currentTrackId !== trackId) return
    editingMetadata.value = metadata
  }

  function close(): void {
    if (isSavingMetadata.value) return

    if (unsubscribeStatus) {
      unsubscribeStatus()
      unsubscribeStatus = null
    }
    currentTrackId = null
    currentVersion = 0
    editStatus.value = 'checking'

    const returnTarget =
      pendingReturnTarget ??
      (editingMetadata.value
        ? { trackId: editingMetadata.value.trackId, source: 'track' as const }
        : null)

    editingMetadata.value = null
    metadataEditError.value = null
    pendingReturnTarget = null

    if (returnTarget) {
      void options.restoreFocus(returnTarget)
    }
  }

  function dispose(): void {
    if (unsubscribeStatus) {
      unsubscribeStatus()
      unsubscribeStatus = null
    }
    currentTrackId = null
    currentVersion = 0
  }

  async function save(metadata: EditableTrackMetadata): Promise<void> {
    if (isSavingMetadata.value || editStatus.value !== 'editable') {
      return
    }

    isSavingMetadata.value = true
    metadataEditError.value = null
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
          metadataEditError.value = options.getPlaybackInUseMessage
            ? options.getPlaybackInUseMessage()
            : '此歌曲正由播放器使用，暂时无法修改元数据。请切换到其他歌曲后再试。'
        } else if (rejected.reason === 'write-in-progress') {
          editStatus.value = 'write-in-progress'
          metadataEditError.value = options.getSaveErrorMessage()
        } else {
          metadataEditError.value = options.getSaveErrorMessage()
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
      editingMetadata.value = null
      pendingReturnTarget = null

      if (isStillInSaveScope) {
        await options.restoreFocus(returnTarget)
      }
    } catch (error) {
      options.logSaveError?.(error)
      if (!options.isDisposed()) {
        metadataEditError.value = options.getSaveErrorMessage()
      }
    } finally {
      if (!options.isDisposed()) {
        isSavingMetadata.value = false
      }
    }
  }

  return {
    editingMetadata,
    isSavingMetadata,
    metadataEditError,
    editStatus,
    setReturnTarget,
    open,
    close,
    save,
    retryCheckStatus,
    dispose,
  }
}
