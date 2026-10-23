import { describe, expect, it, vi } from 'vitest'
import { ref, shallowRef } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { LibraryPageIdentity } from '../types/libraryPageIdentity'
import type { LibraryViewMode } from '../types/libraryInteraction'
import { createAllSongsLibrarySnapshot } from '../utils/libraryDataSnapshot'
import { useLibrarySnapshotPresentation } from './useLibrarySnapshotPresentation'

function fixture() {
  const pageIdentity = ref<LibraryPageIdentity | null>(null)
  const tracks = shallowRef<TrackListItem[]>([])
  const libraryViewMode = ref<LibraryViewMode>('flat')
  const message = ref('load failed')
  const committed = vi.fn()
  return {
    pageIdentity,
    tracks,
    libraryViewMode,
    message,
    committed,
    ...useLibrarySnapshotPresentation({
      pageIdentity,
      tracks,
      libraryViewMode,
      onSnapshotCommitted: committed,
      loadErrorMessage: () => message.value,
    }),
  }
}
describe('library snapshot presentation', () => {
  it('starts without a published scope, loading error or positioning operation', () => {
    const f = fixture()
    expect(f.initialLoadError.value).toBeNull()
    expect(f.hasPreviousSnapshot({ kind: 'library' })).toBe(false)
    expect(f.isPositioningForegroundViewport.value).toBe(false)
    expect(f.committed).not.toHaveBeenCalled()
  })
  it('publishes all view references before notifying consumers and records scope separately', () => {
    const f = fixture()
    const snapshot = createAllSongsLibrarySnapshot([], 'cover')
    f.committed.mockImplementation(() => {
      expect(f.pageIdentity.value).toEqual(snapshot.identity)
      expect(f.tracks.value).toBe(snapshot.tracks)
      expect(f.libraryViewMode.value).toBe('cover')
      expect(f.hasPreviousSnapshot({ kind: 'library' })).toBe(false)
    })
    f.commitLibrarySnapshot(snapshot)
    f.recordCommittedScope({ kind: 'library' })
    expect(f.hasPreviousSnapshot({ kind: 'library' })).toBe(true)
    expect(f.committed).toHaveBeenCalledExactlyOnceWith(snapshot)
  })
  it('keeps scope matching specific to recent-added ranges and playlist kind/id', () => {
    const f = fixture()
    f.recordCommittedScope({ kind: 'recent-added', range: 'all' })
    expect(f.hasPreviousSnapshot({ kind: 'recent-added', range: 'all' })).toBe(true)
    expect(f.hasPreviousSnapshot({ kind: 'library' })).toBe(false)
    f.recordCommittedScope({ kind: 'playlist', id: 1 })
    expect(f.hasPreviousSnapshot({ kind: 'playlist', id: 1 })).toBe(true)
    expect(f.hasPreviousSnapshot({ kind: 'smart-playlist', id: 1 })).toBe(false)
    expect(f.hasPreviousSnapshot({ kind: 'playlist', id: 2 })).toBe(false)
  })
  it('resolves error text reactively without clearing the last visible snapshot', () => {
    const f = fixture()
    const snapshot = createAllSongsLibrarySnapshot([], 'cover')
    f.commitLibrarySnapshot(snapshot)
    f.hasInitialLoadError.value = true
    expect(f.initialLoadError.value).toBe('load failed')
    f.message.value = 'translated failure'
    expect(f.initialLoadError.value).toBe('translated failure')
    expect(f.pageIdentity.value).toEqual(snapshot.identity)
    expect(f.libraryViewMode.value).toBe('cover')
    f.hasInitialLoadError.value = false
    expect(f.initialLoadError.value).toBeNull()
  })
})
