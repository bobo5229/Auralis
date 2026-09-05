import { ref } from 'vue'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
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

interface UseLibraryMetadataEditorOptions {
  loadTrackMetadata: (trackId: number) => Promise<EditableTrackMetadata | null>
  updateTrackMetadata: (metadata: EditableTrackMetadata) => Promise<unknown>
  captureRouteScope: () => LibraryRouteScope
  refreshLibrary: () => Promise<LibraryMetadataRefreshResult>
  restoreFocus: (target: LibraryMetadataFocusTarget) => Promise<void>
  isDisposed: () => boolean
  getSaveErrorMessage: () => string
  logSaveError?: (error: unknown) => void
}

export function useLibraryMetadataEditor(options: UseLibraryMetadataEditorOptions) {
  const editingMetadata = ref<EditableTrackMetadata | null>(null)
  const isSavingMetadata = ref(false)
  const metadataEditError = ref<string | null>(null)
  let pendingReturnTarget: LibraryMetadataFocusTarget | null = null

  function setReturnTarget(target: LibraryMetadataFocusTarget): void {
    pendingReturnTarget = target
  }

  async function open(trackId: number): Promise<void> {
    metadataEditError.value = null
    editingMetadata.value = await options.loadTrackMetadata(trackId)
  }

  function close(): void {
    if (isSavingMetadata.value) return

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

  async function save(metadata: EditableTrackMetadata): Promise<void> {
    isSavingMetadata.value = true
    metadataEditError.value = null
    const saveScope = options.captureRouteScope()

    try {
      await options.updateTrackMetadata(metadata)
      if (options.isDisposed()) return

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
    setReturnTarget,
    open,
    close,
    save,
  }
}
