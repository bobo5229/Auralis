import { describe, expect, it, vi } from 'vitest'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import type { LibraryRouteScope } from '../utils/libraryRouteScope'
import type {
  TrackEditStateChangedEvent,
  TrackEditStateResult,
  UpdateTrackMetadataResult,
} from '@shared/ipc/contracts'
import {
  useLibraryMetadataEditor,
  type LibraryMetadataRefreshResult,
} from './useLibraryMetadataEditor'

const metadata: EditableTrackMetadata = {
  trackId: 42,
  title: 'A Song',
  artistDisplay: 'An Artist',
  albumTitle: 'An Album',
  albumArtistDisplay: 'An Artist',
  genreDisplay: 'Ambient',
  year: 2026,
  releaseDate: '2026-08-24',
}

function createEditor(overrides?: {
  scope?: LibraryRouteScope
  refreshResult?: LibraryMetadataRefreshResult
  getTrackEditState?: (trackId: number) => Promise<TrackEditStateResult>
  onTrackEditStateChanged?: (callback: (event: TrackEditStateChangedEvent) => void) => () => void
  updateTrackMetadata?: (
    metadata: EditableTrackMetadata,
  ) => Promise<UpdateTrackMetadataResult | unknown>
}) {
  let scope: LibraryRouteScope = overrides?.scope ?? { kind: 'library' }
  let disposed = false
  const loadTrackMetadata = vi.fn(async () => metadata)
  const updateTrackMetadata = vi.fn(overrides?.updateTrackMetadata ?? (async () => undefined))
  const refreshLibrary = vi.fn(
    async () => overrides?.refreshResult ?? ('committed' as LibraryMetadataRefreshResult),
  )
  const restoreFocus = vi.fn(async () => undefined)
  const logSaveError = vi.fn()
  const editor = useLibraryMetadataEditor({
    loadTrackMetadata,
    updateTrackMetadata,
    captureRouteScope: () => scope,
    refreshLibrary,
    restoreFocus,
    isDisposed: () => disposed,
    getSaveErrorMessage: () => 'save failed',
    getPlaybackInUseMessage: () => 'track in use by player',
    getQueryFailedMessage: () => 'query failed',
    getTrackEditState: overrides?.getTrackEditState,
    onTrackEditStateChanged: overrides?.onTrackEditStateChanged,
    logSaveError,
  })

  return {
    editor,
    loadTrackMetadata,
    updateTrackMetadata,
    refreshLibrary,
    restoreFocus,
    logSaveError,
    setScope: (nextScope: LibraryRouteScope) => {
      scope = nextScope
    },
    dispose: () => {
      disposed = true
    },
  }
}

describe('useLibraryMetadataEditor', () => {
  it('opens metadata and restores the handed-off menu target when closed', async () => {
    const { editor, loadTrackMetadata, restoreFocus } = createEditor()
    const menuTarget = {
      trackId: metadata.trackId,
      source: 'album-artwork' as const,
      openReason: 'keyboard' as const,
    }

    editor.setReturnTarget(menuTarget)
    await editor.open(metadata.trackId)
    editor.close()

    expect(loadTrackMetadata).toHaveBeenCalledWith(metadata.trackId)
    expect(editor.editingMetadata.value).toBeNull()
    expect(restoreFocus).toHaveBeenCalledWith(menuTarget)
  })

  it('writes metadata, refreshes the complete snapshot, and restores focus', async () => {
    const { editor, updateTrackMetadata, refreshLibrary, restoreFocus } = createEditor()
    await editor.open(metadata.trackId)

    await editor.save(metadata)

    expect(updateTrackMetadata).toHaveBeenCalledWith(metadata)
    expect(refreshLibrary).toHaveBeenCalledOnce()
    expect(editor.editingMetadata.value).toBeNull()
    expect(editor.isSavingMetadata.value).toBe(false)
    expect(editor.metadataEditError.value).toBeNull()
    expect(restoreFocus).toHaveBeenCalledWith({ trackId: metadata.trackId, source: 'track' })
  })

  it.each(['failed', 'queued', 'stale'] as const)(
    'keeps the editor open when a same-scope %s refresh cannot be committed',
    async (refreshResult) => {
      const { editor, restoreFocus, logSaveError } = createEditor({ refreshResult })
      await editor.open(metadata.trackId)

      await editor.save(metadata)

      expect(editor.editingMetadata.value).toEqual(metadata)
      expect(editor.metadataEditError.value).toBe('save failed')
      expect(editor.isSavingMetadata.value).toBe(false)
      expect(restoreFocus).not.toHaveBeenCalled()
      expect(logSaveError).toHaveBeenCalledOnce()
    },
  )

  it('accepts a stale refresh after navigation without restoring focus into the old route', async () => {
    const { editor, refreshLibrary, restoreFocus, setScope } = createEditor({
      scope: { kind: 'playlist', id: 1 },
      refreshResult: 'stale',
    })
    refreshLibrary.mockImplementation(async () => {
      setScope({ kind: 'playlist', id: 2 })
      return 'stale'
    })
    await editor.open(metadata.trackId)

    await editor.save(metadata)

    expect(editor.editingMetadata.value).toBeNull()
    expect(editor.metadataEditError.value).toBeNull()
    expect(restoreFocus).not.toHaveBeenCalled()
  })

  it('does not publish editor state after the page is disposed', async () => {
    const { editor, updateTrackMetadata, dispose, refreshLibrary, restoreFocus } = createEditor()
    updateTrackMetadata.mockImplementation(async () => {
      dispose()
    })
    await editor.open(metadata.trackId)

    await editor.save(metadata)

    expect(refreshLibrary).not.toHaveBeenCalled()
    expect(restoreFocus).not.toHaveBeenCalled()
    expect(editor.metadataEditError.value).toBeNull()
  })

  it('queries edit state on open and updates editStatus', async () => {
    const getTrackEditState = vi.fn(async () => ({
      trackId: metadata.trackId,
      status: 'playback-in-use' as const,
      version: 1,
    }))
    const { editor } = createEditor({ getTrackEditState })

    await editor.open(metadata.trackId)

    expect(getTrackEditState).toHaveBeenCalledWith(metadata.trackId)
    expect(editor.editStatus.value).toBe('playback-in-use')
  })

  it('updates editStatus when onTrackEditStateChanged emits for current track', async () => {
    let listener: ((event: TrackEditStateChangedEvent) => void) | undefined
    const onTrackEditStateChanged = vi.fn((cb: (event: TrackEditStateChangedEvent) => void) => {
      listener = cb
      return () => {
        listener = undefined
      }
    })
    const getTrackEditState = vi.fn(async () => ({
      trackId: metadata.trackId,
      status: 'editable' as const,
      version: 1,
    }))
    const { editor } = createEditor({ getTrackEditState, onTrackEditStateChanged })

    await editor.open(metadata.trackId)
    expect(editor.editStatus.value).toBe('editable')

    listener?.({ trackId: metadata.trackId, status: 'playback-in-use', version: 2 })
    expect(editor.editStatus.value).toBe('playback-in-use')

    listener?.({ trackId: metadata.trackId, status: 'editable', version: 3 })
    expect(editor.editStatus.value).toBe('editable')
  })

  it('ignores onTrackEditStateChanged events for other tracks', async () => {
    let listener: ((event: TrackEditStateChangedEvent) => void) | undefined
    const onTrackEditStateChanged = vi.fn((cb: (event: TrackEditStateChangedEvent) => void) => {
      listener = cb
      return () => {}
    })
    const getTrackEditState = vi.fn(async () => ({
      trackId: metadata.trackId,
      status: 'editable' as const,
      version: 1,
    }))
    const { editor } = createEditor({ getTrackEditState, onTrackEditStateChanged })

    await editor.open(metadata.trackId)
    expect(editor.editStatus.value).toBe('editable')

    listener?.({ trackId: 9999, status: 'playback-in-use', version: 2 })
    expect(editor.editStatus.value).toBe('editable')
  })

  it('ignores out-of-order query responses with lower version than event', async () => {
    let listener: ((event: TrackEditStateChangedEvent) => void) | undefined
    const onTrackEditStateChanged = vi.fn((cb: (event: TrackEditStateChangedEvent) => void) => {
      listener = cb
      return () => {}
    })
    let resolveQuery: (value: TrackEditStateResult) => void
    const queryPromise = new Promise<TrackEditStateResult>((resolve) => {
      resolveQuery = resolve
    })
    const getTrackEditState = vi.fn(() => queryPromise)

    const { editor } = createEditor({ getTrackEditState, onTrackEditStateChanged })

    const openPromise = editor.open(metadata.trackId)

    // While query is pending, a newer event arrives with version 5 ('playback-in-use')
    listener?.({ trackId: metadata.trackId, status: 'playback-in-use', version: 5 })
    expect(editor.editStatus.value).toBe('playback-in-use')

    // Now query resolves with stale version 2 ('editable')
    resolveQuery!({ trackId: metadata.trackId, status: 'editable', version: 2 })
    await openPromise

    // Status must remain playback-in-use (version 5 wins over stale version 2)
    expect(editor.editStatus.value).toBe('playback-in-use')
  })

  it('prevents save when editStatus is not editable', async () => {
    const getTrackEditState = vi.fn(async () => ({
      trackId: metadata.trackId,
      status: 'playback-in-use' as const,
      version: 1,
    }))
    const { editor, updateTrackMetadata } = createEditor({ getTrackEditState })

    await editor.open(metadata.trackId)
    expect(editor.editStatus.value).toBe('playback-in-use')

    await editor.save(metadata)

    expect(updateTrackMetadata).not.toHaveBeenCalled()
    expect(editor.editingMetadata.value).toEqual(metadata)
  })

  it('handles atomic rejection from updateTrackMetadata for playback-in-use without closing dialog', async () => {
    const updateTrackMetadata = vi.fn(async () => ({
      ok: false as const,
      reason: 'playback-in-use' as const,
    }))
    const { editor, refreshLibrary } = createEditor({ updateTrackMetadata })

    await editor.open(metadata.trackId)
    await editor.save(metadata)

    expect(editor.editStatus.value).toBe('playback-in-use')
    expect(editor.metadataEditError.value).toBe('track in use by player')
    expect(editor.editingMetadata.value).toEqual(metadata)
    expect(editor.isSavingMetadata.value).toBe(false)
    expect(refreshLibrary).not.toHaveBeenCalled()
  })

  it('handles query failure by transitioning to query-failed and allows retry', async () => {
    let shouldFail = true
    const getTrackEditState = vi.fn(async () => {
      if (shouldFail) {
        throw new Error('IPC timeout')
      }
      return { trackId: metadata.trackId, status: 'editable' as const, version: 1 }
    })
    const { editor } = createEditor({ getTrackEditState })

    await editor.open(metadata.trackId)
    expect(editor.editStatus.value).toBe('query-failed')

    shouldFail = false
    await editor.retryCheckStatus()
    expect(editor.editStatus.value).toBe('editable')
  })

  it('unsubscribes status events when dialog is closed', async () => {
    const unsubscribe = vi.fn()
    const onTrackEditStateChanged = vi.fn(() => unsubscribe)
    const { editor } = createEditor({ onTrackEditStateChanged })

    await editor.open(metadata.trackId)
    expect(onTrackEditStateChanged).toHaveBeenCalledOnce()
    expect(unsubscribe).not.toHaveBeenCalled()

    editor.close()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
