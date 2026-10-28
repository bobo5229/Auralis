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
  retainAfterSave?: boolean
  onWriteCommitted?: () => void | Promise<void>
  scope?: LibraryRouteScope
  refreshResult?: LibraryMetadataRefreshResult
  getTrackEditState?: (trackId: number) => Promise<TrackEditStateResult>
  onTrackEditStateChanged?: (callback: (event: TrackEditStateChangedEvent) => void) => () => void
  updateTrackMetadata?: (
    metadata: EditableTrackMetadata,
  ) => Promise<UpdateTrackMetadataResult | unknown>
  getSaveFailureMessage?: (reason: string) => string
  getSaveErrorMessage?: () => string
  getLoadErrorMessage?: () => string
  showSaveSuccess?: (signal: AbortSignal) => Promise<void>
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
    retainAfterSave: overrides?.retainAfterSave,
    onWriteCommitted: overrides?.onWriteCommitted,
    captureRouteScope: () => scope,
    refreshLibrary,
    showSaveSuccess: overrides?.showSaveSuccess,
    restoreFocus,
    isDisposed: () => disposed,
    getSaveErrorMessage: overrides?.getSaveErrorMessage ?? (() => 'save failed'),
    getSaveFailureMessage: overrides?.getSaveFailureMessage,
    getLoadErrorMessage: overrides?.getLoadErrorMessage ?? (() => 'load failed'),
    getPlaybackInUseMessage: () => 'track in use by player',
    getPreloadInUseMessage: () => 'track preloaded',
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
  it.each(['rejected', 'thrown', 'reopened'] as const)(
    'resubmits original values after an uncertain save (%s)',
    async (failure) => {
      const showSaveSuccess = vi.fn(async () => undefined)
      const { editor, updateTrackMetadata } = createEditor({ showSaveSuccess })
      updateTrackMetadata.mockImplementationOnce(async () => {
        if (failure === 'thrown') throw new Error('IPC failed after publication')
        return { ok: false, reason: 'save-failed' }
      })
      await editor.open(42)
      await editor.save({ ...metadata, title: 'Published despite failure' })
      expect(showSaveSuccess).not.toHaveBeenCalled()
      if (failure === 'reopened') {
        editor.close()
        await editor.open(42)
      }
      await editor.save(metadata)
      expect(updateTrackMetadata).toHaveBeenCalledTimes(2)
      expect(updateTrackMetadata).toHaveBeenLastCalledWith(metadata)
      expect(showSaveSuccess).toHaveBeenCalledOnce()
      expect(editor.isMetadataEditorOpen.value).toBe(false)
    },
  )

  it('resubmits the prior committed value after a later uncertain save', async () => {
    const { editor, updateTrackMetadata } = createEditor({ refreshResult: 'failed' })
    await editor.open(42)
    const committed = { ...metadata, title: 'Committed' }
    await editor.save(committed)
    updateTrackMetadata.mockResolvedValueOnce({ ok: false, reason: 'playback-restore-failed' })
    await editor.save({ ...metadata, title: 'Published later' })
    await editor.save(committed)
    expect(updateTrackMetadata).toHaveBeenCalledTimes(3)
    expect(updateTrackMetadata).toHaveBeenLastCalledWith(committed)
  })

  it('keeps the dialog busy until successful feedback finishes, then closes and restores focus', async () => {
    let finish!: () => void
    const showSaveSuccess = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const { editor, refreshLibrary, restoreFocus } = createEditor({ showSaveSuccess })
    await editor.open(42)
    const saving = editor.save({ ...metadata, title: 'Changed title' })
    await vi.waitFor(() => expect(showSaveSuccess).toHaveBeenCalledOnce())
    expect(refreshLibrary).toHaveBeenCalledOnce()
    expect(editor.isSavingMetadata.value).toBe(true)
    expect(editor.isMetadataEditorOpen.value).toBe(true)
    expect(restoreFocus).not.toHaveBeenCalled()
    finish()
    await saving
    expect(editor.isMetadataEditorOpen.value).toBe(false)
    expect(editor.isSavingMetadata.value).toBe(false)
    expect(restoreFocus).toHaveBeenCalledOnce()
  })

  it('does not play success feedback after a rejected save', async () => {
    const showSaveSuccess = vi.fn(async () => undefined)
    const { editor } = createEditor({
      showSaveSuccess,
      updateTrackMetadata: async () => ({ ok: false, reason: 'tag-preservation-failed' }),
    })
    await editor.open(42)
    await editor.save({ ...metadata, title: 'Changed title' })
    expect(showSaveSuccess).not.toHaveBeenCalled()
    expect(editor.isMetadataEditorOpen.value).toBe(true)
    expect(editor.isSavingMetadata.value).toBe(false)
  })

  it('aborts pending success feedback on disposal without returning focus to an old editor', async () => {
    const showSaveSuccess = vi.fn(
      (signal: AbortSignal) =>
        new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => resolve(), { once: true })
        }),
    )
    const { editor, restoreFocus } = createEditor({ showSaveSuccess })
    await editor.open(42)
    const saving = editor.save({ ...metadata, title: 'Changed title' })
    await vi.waitFor(() => expect(showSaveSuccess).toHaveBeenCalledOnce())
    editor.dispose()
    await saving
    expect(showSaveSuccess.mock.calls[0][0].aborted).toBe(true)
    expect(editor.isMetadataEditorOpen.value).toBe(false)
    expect(restoreFocus).not.toHaveBeenCalled()
  })

  it('shows successful feedback for unchanged input without writing or refreshing', async () => {
    const showSaveSuccess = vi.fn(async () => undefined)
    const { editor, updateTrackMetadata, refreshLibrary } = createEditor({ showSaveSuccess })
    await editor.open(42)
    await editor.save(metadata)
    expect(showSaveSuccess).toHaveBeenCalledOnce()
    expect(updateTrackMetadata).not.toHaveBeenCalled()
    expect(refreshLibrary).not.toHaveBeenCalled()
    expect(editor.isMetadataEditorOpen.value).toBe(false)
  })

  it('passes the successful commit revision to refresh and restores focus after it completes', async () => {
    const { editor, refreshLibrary, restoreFocus } = createEditor({
      updateTrackMetadata: async () => ({ ok: true, libraryRevision: '12:1' }),
    })
    await editor.open(42)
    await editor.save({ ...metadata, title: 'Changed title' })
    expect(refreshLibrary).toHaveBeenCalledWith('12:1')
    expect(editor.isMetadataEditorOpen.value).toBe(false)
    expect(restoreFocus).toHaveBeenCalledWith({ trackId: 42, source: 'track' })
  })

  it('writes a reversion to the original values after a committed save fails to refresh', async () => {
    let persisted = { ...metadata }
    const { editor, updateTrackMetadata, refreshLibrary } = createEditor({
      updateTrackMetadata: async (next) => {
        persisted = { ...next }
        return { ok: true, libraryRevision: '12:1' }
      },
    })
    refreshLibrary.mockResolvedValueOnce('failed')
    await editor.open(metadata.trackId)
    await editor.save({ ...metadata, title: 'Changed title' })
    expect(persisted.title).toBe('Changed title')
    expect(editor.isMetadataEditorOpen.value).toBe(true)
    expect(editor.metadataEditError.value).toBe('save failed')

    await editor.save({ ...metadata })
    expect(persisted).toEqual(metadata)
    expect(updateTrackMetadata).toHaveBeenCalledTimes(2)
    expect(refreshLibrary).toHaveBeenCalledTimes(2)
    expect(editor.isMetadataEditorOpen.value).toBe(false)
  })

  it('retries the failed refresh without resubmitting already committed values', async () => {
    const showSaveSuccess = vi.fn(async () => undefined)
    const { editor, updateTrackMetadata, refreshLibrary, restoreFocus } = createEditor({
      updateTrackMetadata: async () => ({ ok: true, libraryRevision: '12:1' }),
      showSaveSuccess,
    })
    refreshLibrary.mockRejectedValueOnce(new Error('isolated query failure'))
    await editor.open(metadata.trackId)
    const changed = { ...metadata, title: 'Changed title' }
    await editor.save(changed)
    expect(showSaveSuccess).not.toHaveBeenCalled()
    expect(editor.isMetadataEditorOpen.value).toBe(true)

    await editor.save(changed)
    expect(updateTrackMetadata).toHaveBeenCalledOnce()
    expect(refreshLibrary).toHaveBeenCalledTimes(2)
    expect(refreshLibrary).toHaveBeenLastCalledWith('12:1')
    expect(showSaveSuccess).toHaveBeenCalledOnce()
    expect(restoreFocus).toHaveBeenCalledOnce()
    expect(editor.isMetadataEditorOpen.value).toBe(false)
    expect(editor.metadataEditError.value).toBeNull()
  })

  it('uses the newly loaded baseline after closing an editor with a failed refresh', async () => {
    const { editor, loadTrackMetadata, updateTrackMetadata, refreshLibrary } = createEditor({
      updateTrackMetadata: async () => ({ ok: true, libraryRevision: '12:1' }),
    })
    refreshLibrary.mockResolvedValueOnce('failed')
    await editor.open(metadata.trackId)
    const changed = { ...metadata, title: 'Changed title' }
    await editor.save(changed)
    editor.close()
    loadTrackMetadata.mockResolvedValueOnce(changed)
    await editor.open(metadata.trackId)
    await editor.save(changed)
    expect(updateTrackMetadata).toHaveBeenCalledOnce()
    expect(refreshLibrary).toHaveBeenCalledOnce()
    expect(editor.isMetadataEditorOpen.value).toBe(false)
  })

  it('closes an unchanged edit and restores focus without invoking IPC or refreshing the library', async () => {
    const { editor, updateTrackMetadata, refreshLibrary, restoreFocus } = createEditor()
    await editor.open(42)
    await editor.save({ ...metadata, title: ' A Song ', artistDisplay: 'An Artist; an artist' })
    expect(updateTrackMetadata).not.toHaveBeenCalled()
    expect(refreshLibrary).not.toHaveBeenCalled()
    expect(editor.isMetadataEditorOpen.value).toBe(false)
    expect(editor.isSavingMetadata.value).toBe(false)
    expect(restoreFocus).toHaveBeenCalledWith({ trackId: 42, source: 'track' })
  })

  it('shows the localized preservation failure, retains input and allows a changed edit to be retried', async () => {
    const language = ref('zh')
    const { editor, updateTrackMetadata, refreshLibrary } = createEditor({
      updateTrackMetadata: async () => ({ ok: false, reason: 'tag-preservation-failed' }),
      getSaveFailureMessage: (reason) =>
        language.value === 'zh'
          ? `保存会丢失原有标签：${reason}`
          : `Existing tags would be lost: ${reason}`,
    })
    await editor.open(42)
    const changed = { ...metadata, title: 'Changed title' }
    await editor.save(changed)
    expect(editor.metadataEditError.value).toBe('保存会丢失原有标签：tag-preservation-failed')
    expect(editor.isMetadataEditorOpen.value).toBe(true)
    expect(editor.editingMetadata.value).toEqual(metadata)
    expect(refreshLibrary).not.toHaveBeenCalled()
    language.value = 'en'
    expect(editor.metadataEditError.value).toBe(
      'Existing tags would be lost: tag-preservation-failed',
    )
    updateTrackMetadata.mockResolvedValueOnce({ ok: true })
    await editor.save(changed)
    expect(updateTrackMetadata).toHaveBeenCalledTimes(2)
    expect(editor.isMetadataEditorOpen.value).toBe(false)
  })
  it('blocks saving a preloaded track and follows its transition into playback', async () => {
    let listener!: (event: TrackEditStateChangedEvent) => void
    const { editor, updateTrackMetadata } = createEditor({
      getTrackEditState: async (trackId) => ({ trackId, status: 'preload-in-use', version: 1 }),
      onTrackEditStateChanged: (callback) => {
        listener = callback
        return () => {}
      },
    })
    await editor.open(metadata.trackId)
    expect(editor.editStatus.value).toBe('preload-in-use')
    await editor.save({ ...metadata, title: 'Changed title' })
    expect(updateTrackMetadata).not.toHaveBeenCalled()
    listener({ trackId: metadata.trackId, status: 'playback-in-use', version: 2 })
    expect(editor.editStatus.value).toBe('playback-in-use')
    listener({ trackId: metadata.trackId, status: 'playback-editable', version: 3 })
    await editor.save({ ...metadata, title: 'Changed title' })
    expect(updateTrackMetadata).toHaveBeenCalledOnce()
  })

  it('retains the preload notice when a preload races with saving', async () => {
    let listener!: (event: TrackEditStateChangedEvent) => void
    const { editor } = createEditor({
      getTrackEditState: async (trackId) => ({ trackId, status: 'editable', version: 1 }),
      onTrackEditStateChanged: (callback) => {
        listener = callback
        return () => {}
      },
      updateTrackMetadata: async () => {
        listener({ trackId: metadata.trackId, status: 'preload-in-use', version: 2 })
        return { ok: false, reason: 'playback-in-use' }
      },
    })
    await editor.open(metadata.trackId)
    await editor.save({ ...metadata, title: 'Changed title' })
    expect(editor.editStatus.value).toBe('preload-in-use')
    expect(editor.metadataEditError.value).toBe('track preloaded')
    expect(editor.editingMetadata.value).toEqual(metadata)
  })

  it('allows saving during cooperating playback and retains the draft when buffering fails', async () => {
    const { editor, updateTrackMetadata, refreshLibrary } = createEditor({
      getTrackEditState: async (trackId) => ({ trackId, status: 'playback-editable', version: 1 }),
      updateTrackMetadata: async () => ({ ok: false, reason: 'buffer-preparation-failed' }),
    })
    await editor.open(42)
    await editor.save({ ...metadata, title: 'New title' })
    expect(updateTrackMetadata).toHaveBeenCalledWith({ ...metadata, title: 'New title' })
    expect(editor.isMetadataEditorOpen.value).toBe(true)
    expect(editor.editingMetadata.value).not.toBeNull()
    expect(editor.isSavingMetadata.value).toBe(false)
    expect(refreshLibrary).not.toHaveBeenCalled()
  })
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
      await editor.save({ ...metadata, title: 'Changed title' })
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
    await editor.save({ ...metadata, title: 'Changed title' })
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

    await editor.save({ ...metadata, title: 'Changed title' })

    expect(updateTrackMetadata).toHaveBeenCalledWith({ ...metadata, title: 'Changed title' })
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

      await editor.save({ ...metadata, title: 'Changed title' })

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

    await editor.save({ ...metadata, title: 'Changed title' })

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

    await editor.save({ ...metadata, title: 'Changed title' })

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

    await editor.save({ ...metadata, title: 'Changed title' })

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
    await editor.save({ ...metadata, title: 'Changed title' })

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

it('keeps a retained editor open and retries snapshot refresh without repeating a committed write', async () => {
  const onWriteCommitted = vi.fn()
  const { editor, loadTrackMetadata, updateTrackMetadata } = createEditor({
    retainAfterSave: true,
    onWriteCommitted,
  })
  await editor.open(42)
  const draft = { ...metadata, title: 'Committed title' }
  loadTrackMetadata.mockResolvedValueOnce(null)
  await editor.save(draft)
  expect(editor.isMetadataEditorOpen.value).toBe(true)
  expect(editor.metadataEditError.value).toBe('save failed')
  loadTrackMetadata.mockResolvedValueOnce({ ...draft, editToken: 'fresh' })
  await editor.save(draft)
  expect(updateTrackMetadata).toHaveBeenCalledOnce()
  expect(onWriteCommitted).toHaveBeenCalledOnce()
  expect(editor.editingMetadata.value?.editToken).toBe('fresh')
  expect(editor.isMetadataEditorOpen.value).toBe(true)
})
it('refreshes a peer token only when file metadata and legacy state still match', async () => {
  const { editor, loadTrackMetadata, updateTrackMetadata } = createEditor({ retainAfterSave: true })
  await editor.open(42)
  loadTrackMetadata.mockResolvedValueOnce({ ...metadata, editToken: 'peer-token' })
  await editor.refreshCredentials()
  expect(editor.editingMetadata.value?.editToken).toBe('peer-token')
  loadTrackMetadata.mockResolvedValueOnce({
    ...metadata,
    title: 'External title',
    editToken: 'external',
  })
  await editor.refreshCredentials()
  expect(editor.conflict.value).toBe(true)
  expect(editor.editingMetadata.value?.title).toBe(metadata.title)
  await editor.save({ ...metadata, title: 'Draft' })
  expect(updateTrackMetadata).not.toHaveBeenCalled()
})
