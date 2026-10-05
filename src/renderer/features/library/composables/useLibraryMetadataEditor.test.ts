import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
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
  getSaveErrorMessage?: () => string
  getLoadErrorMessage?: () => string
}) {
  let scope: LibraryRouteScope = overrides?.scope ?? { kind: 'library' }
  let disposed = false
  const loadTrackMetadata = vi.fn(async (): Promise<EditableTrackMetadata | null> => metadata)
  const updateTrackMetadata = vi.fn(overrides?.updateTrackMetadata ?? (async () => undefined))
  const refreshLibrary = vi.fn(
    async () => overrides?.refreshResult ?? ('committed' as LibraryMetadataRefreshResult),
  )
  const restoreFocus = vi.fn(async () => undefined)
  const logSaveError = vi.fn()
  const logLoadError = vi.fn()
  const editor = useLibraryMetadataEditor({
    loadTrackMetadata,
    updateTrackMetadata,
    captureRouteScope: () => scope,
    refreshLibrary,
    restoreFocus,
    isDisposed: () => disposed,
    getSaveErrorMessage: overrides?.getSaveErrorMessage ?? (() => 'save failed'),
    getLoadErrorMessage: overrides?.getLoadErrorMessage ?? (() => 'load failed'),
    getPlaybackInUseMessage: () => 'track in use by player',
    getQueryFailedMessage: () => 'query failed',
    getTrackEditState: overrides?.getTrackEditState,
    onTrackEditStateChanged: overrides?.onTrackEditStateChanged,
    logSaveError,
    logLoadError,
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
  it.each(['reject', 'null'] as const)(
    'shows a recoverable load error on %s without allowing a save',
    async (failure) => {
      const { editor, loadTrackMetadata, updateTrackMetadata } = createEditor()
      if (failure === 'reject') loadTrackMetadata.mockRejectedValueOnce(new Error('IPC failure'))
      else loadTrackMetadata.mockResolvedValueOnce(null)
      const pending = editor.open(42)
      expect(editor.isMetadataEditorOpen.value).toBe(true)
      expect(editor.isLoadingMetadata.value).toBe(true)
      await expect(pending).resolves.toBeUndefined()
      expect(editor.isLoadingMetadata.value).toBe(false)
      expect(editor.metadataEditError.value).toBe('load failed')
      expect(editor.editingMetadata.value).toBeNull()
      await editor.save(metadata)
      expect(updateTrackMetadata).not.toHaveBeenCalled()
      await editor.retryLoad()
      expect(editor.editingMetadata.value).toEqual(metadata)
      expect(editor.metadataEditError.value).toBeNull()
      expect(editor.isMetadataEditorOpen.value).toBe(true)
      editor.close()
    },
  )

  it.each(['close', 'dispose', 'replace', 'reopen-same-track'] as const)(
    'ignores late metadata after %s',
    async (action) => {
      const { editor, loadTrackMetadata } = createEditor()
      let finish!: (value: EditableTrackMetadata) => void
      loadTrackMetadata.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve
        }),
      )
      const pending = editor.open(42)
      if (action === 'close') editor.close()
      if (action === 'dispose') editor.dispose()
      if (action === 'replace' || action === 'reopen-same-track') {
        editor.close()
        const trackId = action === 'replace' ? 43 : 42
        loadTrackMetadata.mockResolvedValueOnce({ ...metadata, trackId, title: 'Latest' })
        await editor.open(trackId)
      }
      finish(metadata)
      await pending
      if (action === 'close' || action === 'dispose') {
        expect(editor.isMetadataEditorOpen.value).toBe(false)
        expect(editor.editingMetadata.value).toBeNull()
      } else expect(editor.editingMetadata.value?.title).toBe('Latest')
      expect(editor.isLoadingMetadata.value).toBe(false)
      expect(editor.metadataEditError.value).toBeNull()
      editor.dispose()
    },
  )

  it('ignores late errors and edit-state responses when the same track is reopened', async () => {
    let reject!: (cause: Error) => void
    let finishStatus!: (value: TrackEditStateResult) => void
    const getTrackEditState = vi.fn(
      async (): Promise<TrackEditStateResult> => ({ trackId: 42, status: 'editable', version: 1 }),
    )
    getTrackEditState.mockReturnValueOnce(
      new Promise((resolve) => {
        finishStatus = resolve
      }),
    )
    const { editor, loadTrackMetadata } = createEditor({ getTrackEditState })
    loadTrackMetadata.mockReturnValueOnce(
      new Promise((_resolve, no) => {
        reject = no
      }),
    )
    const pending = editor.open(42)
    editor.close()
    await editor.open(42)
    finishStatus({ trackId: 42, status: 'playback-in-use', version: 99 })
    reject(new Error('Old failure'))
    await pending
    expect(editor.editStatus.value).toBe('editable')
    expect(editor.metadataEditError.value).toBeNull()
    expect(editor.editingMetadata.value).toEqual(metadata)
    editor.dispose()
  })

  it('localizes the load error and restores focus when closing a failed load', async () => {
    const locale = ref('zh')
    const { editor, loadTrackMetadata, restoreFocus } = createEditor({
      getLoadErrorMessage: () => (locale.value === 'zh' ? '读取失败' : 'Load failed'),
    })
    loadTrackMetadata.mockRejectedValueOnce(new Error('Unavailable'))
    await editor.open(42)
    expect(editor.metadataEditError.value).toBe('读取失败')
    locale.value = 'en'
    expect(editor.metadataEditError.value).toBe('Load failed')
    editor.close()
    expect(restoreFocus).toHaveBeenCalledWith({ trackId: 42, source: 'track' })
  })

  it('refreshes an existing error after a language change without repeating the save', async () => {
    const language = ref('zh-Hans')
    const { editor, updateTrackMetadata } = createEditor({
      updateTrackMetadata: async () => {
        throw new Error('technical detail')
      },
      getSaveErrorMessage: () => (language.value === 'en' ? 'Could not save' : '保存失败'),
    })
    await editor.open(metadata.trackId)
    await editor.save(metadata)
    expect(editor.metadataEditError.value).toBe('保存失败')
    language.value = 'en'
    expect(editor.metadataEditError.value).toBe('Could not save')
    expect(updateTrackMetadata).toHaveBeenCalledOnce()
    expect(editor.editingMetadata.value?.title).toBe('A Song')
  })
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
