import { describe, expect, it, vi } from 'vitest'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import type { LibraryRouteScope } from '../utils/libraryRouteScope'
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
}) {
  let scope: LibraryRouteScope = overrides?.scope ?? { kind: 'library' }
  let disposed = false
  const loadTrackMetadata = vi.fn(async () => metadata)
  const updateTrackMetadata = vi.fn(async () => undefined)
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
})
