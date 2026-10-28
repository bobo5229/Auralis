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
import { createLibraryMetadataSaveCommit } from '../utils/libraryMetadataSaveCommit'
import { isSameEditableMetadata } from '@shared/utils/editableMetadata'

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
    baseline?: EditableTrackMetadata,
  ) => Promise<UpdateTrackMetadataResult | unknown>
  captureRouteScope?: () => LibraryRouteScope
  refreshLibrary?: (libraryRevision?: string) => Promise<LibraryMetadataRefreshResult>
  retainAfterSave?: boolean
  onWriteCommitted?: () => void | Promise<void>
  showSaveSuccess?: (signal: AbortSignal) => Promise<void>
  restoreFocus?: (target: LibraryMetadataFocusTarget) => Promise<void>
  isDisposed: () => boolean
  getSaveErrorMessage: () => string
  getSaveFailureMessage?: (reason: string) => string
  getLoadErrorMessage?: () => string
  getPlaybackInUseMessage?: () => string
  getPreloadInUseMessage?: () => string
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
  const conflict = ref(false)

  let currentTrackId: number | null = null
  let currentVersion = 0
  let unsubscribeStatus: (() => void) | null = null
  let pendingReturnTarget: LibraryMetadataFocusTarget | null = null
  let loadRevision = 0
  let saveFeedbackController: AbortController | null = null
  const saveCommit = createLibraryMetadataSaveCommit()

  async function showSaveSuccess(signal: AbortSignal): Promise<void> {
    try {
      await options.showSaveSuccess?.(signal)
    } catch (error) {
      // The data has already been saved. A feedback failure must not turn it
      // into a failed write or invite another submission.
      if (!signal.aborted) options.logSaveError?.(error)
    }
  }

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
    conflict.value = false
    saveCommit.reset()
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

  function close(restoreFocus = true): void {
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
    saveCommit.reset()
    currentVersion = 0
    editStatus.value = 'checking'

    const returnTarget =
      pendingReturnTarget ?? (trackId !== null ? { trackId, source: 'track' as const } : null)

    editingMetadata.value = null
    errorMessageSource.value = null
    pendingReturnTarget = null

    if (returnTarget && restoreFocus) {
      void options.restoreFocus?.(returnTarget)
    }
  }

  function dispose(): void {
    saveCommit.reset()
    saveFeedbackController?.abort()
    saveFeedbackController = null
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

  function applySaveRejection(reason: string): void {
    if (reason === 'playback-in-use') {
      if (editStatus.value !== 'preload-in-use') editStatus.value = 'playback-in-use'
      errorMessageSource.value = () =>
        editStatus.value === 'preload-in-use'
          ? (options.getPreloadInUseMessage ?? options.getSaveErrorMessage)()
          : (options.getPlaybackInUseMessage ?? options.getSaveErrorMessage)()
    } else if (reason === 'write-in-progress') {
      editStatus.value = 'write-in-progress'
      errorMessageSource.value = options.getSaveErrorMessage
    } else {
      errorMessageSource.value = options.getSaveFailureMessage
        ? () => options.getSaveFailureMessage!(reason)
        : options.getSaveErrorMessage
    }
  }

  async function save(metadata: EditableTrackMetadata): Promise<void> {
    if (
      isSavingMetadata.value ||
      conflict.value ||
      !['editable', 'playback-editable'].includes(editStatus.value) ||
      !editingMetadata.value ||
      currentTrackId !== metadata.trackId
    ) {
      return
    }

    const unchanged =
      (!metadata.legacyAction ||
        saveCommit.current?.metadata.legacyAction === metadata.legacyAction) &&
      saveCommit.isUnchanged(metadata, editingMetadata.value)
    isSavingMetadata.value = true
    errorMessageSource.value = null
    const saveScope = options.captureRouteScope?.()
    const sameScope = () => {
      const current = options.captureRouteScope?.()
      return !!saveScope && !!current && isSameLibraryRouteScope(saveScope, current)
    }
    const saveLoadRevision = loadRevision
    const controller = new AbortController()
    saveFeedbackController = controller
    const isCurrentSave = () =>
      !controller.signal.aborted && isCurrentLoad(metadata.trackId, saveLoadRevision)

    try {
      if (unchanged && !saveCommit.current) {
        await showSaveSuccess(controller.signal)
        if (!isCurrentSave()) return
        isSavingMetadata.value = false
        if (!options.retainAfterSave) close(sameScope())
        return
      }
      if (!unchanged) {
        saveCommit.beginWrite(metadata.trackId)
        const baseline = {
          ...(saveCommit.current?.metadata ?? editingMetadata.value),
          editToken: editingMetadata.value.editToken,
        }
        const saveResult = editingMetadata.value.editToken
          ? await options.updateTrackMetadata(metadata, baseline)
          : await options.updateTrackMetadata(metadata)
        if (!isCurrentSave()) return

        if (
          saveResult &&
          typeof saveResult === 'object' &&
          'ok' in saveResult &&
          (saveResult as { ok: boolean }).ok === false
        ) {
          const rejected = saveResult as { ok: false; reason: string }
          applySaveRejection(rejected.reason)
          return
        }

        saveCommit.recordCommitted(metadata, saveResult)
        await options.onWriteCommitted?.()
      }

      const returnTarget = pendingReturnTarget ?? {
        trackId: metadata.trackId,
        source: 'track' as const,
      }
      const loadResult =
        (await options.refreshLibrary?.(saveCommit.current?.libraryRevision)) ?? 'committed'
      const isStillInSaveScope = sameScope()

      if (loadResult === 'failed' || loadResult === 'queued') {
        throw new Error('Metadata refresh after save failed')
      }
      if (loadResult === 'stale' && isStillInSaveScope) {
        throw new Error('Metadata refresh after save became stale')
      }
      if (!isCurrentSave()) return
      if (options.retainAfterSave) {
        const fresh = await options.loadTrackMetadata(metadata.trackId)
        if (!isCurrentSave()) return
        if (!fresh) throw new Error('Saved metadata snapshot unavailable')
        editingMetadata.value = fresh
        saveCommit.reset()
        await showSaveSuccess(controller.signal)
        return
      }
      await showSaveSuccess(controller.signal)
      if (!isCurrentSave()) return

      if (unsubscribeStatus) {
        unsubscribeStatus()
        unsubscribeStatus = null
      }
      currentTrackId = null
      saveCommit.reset()
      currentVersion = 0
      loadRevision++
      isMetadataEditorOpen.value = false
      editingMetadata.value = null
      pendingReturnTarget = null

      if (sameScope()) {
        await options.restoreFocus?.(returnTarget)
      }
    } catch (error) {
      options.logSaveError?.(error)
      if (isCurrentSave()) {
        errorMessageSource.value = options.getSaveErrorMessage
      }
    } finally {
      if (saveFeedbackController === controller) saveFeedbackController = null
      if (!options.isDisposed()) {
        isSavingMetadata.value = false
      }
    }
  }

  async function refreshCredentials(): Promise<void> {
    const previous = editingMetadata.value
    if (!previous || currentTrackId === null) return
    const revision = loadRevision
    try {
      const fresh = await options.loadTrackMetadata(previous.trackId)
      if (!isCurrentLoad(previous.trackId, revision)) return
      const committed = saveCommit.current?.metadata
      const expected = committed ?? previous
      const expectedLegacy = committed?.legacyAction ? undefined : previous.legacyMetadata
      if (
        !fresh ||
        !isSameEditableMetadata(fresh, expected) ||
        JSON.stringify(fresh.legacyMetadata) !== JSON.stringify(expectedLegacy)
      ) {
        conflict.value = true
        return
      }
      editingMetadata.value = fresh
      saveCommit.reset()
      conflict.value = false
    } catch {
      if (isCurrentLoad(previous.trackId, revision)) conflict.value = true
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
    conflict,
    refreshCredentials,
  }
}
