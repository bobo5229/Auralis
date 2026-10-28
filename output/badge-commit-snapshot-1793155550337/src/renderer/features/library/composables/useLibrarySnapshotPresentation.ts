import { computed, ref, type Ref } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { LibraryPageIdentity } from '../types/libraryPageIdentity'
import type { LibraryViewMode } from '../types/libraryInteraction'
import type { LibraryDataSnapshot } from '../utils/libraryDataSnapshot'
import { isSameLibraryRouteScope, type LibraryRouteScope } from '../utils/libraryRouteScope'

/** Publishes one complete view; viewport restoration stays with the load coordinator. */
export function useLibrarySnapshotPresentation(options: {
  pageIdentity: Ref<LibraryPageIdentity | null>
  tracks: { value: TrackListItem[] }
  libraryViewMode: Ref<LibraryViewMode>
  onSnapshotCommitted: (snapshot: LibraryDataSnapshot) => void
  loadErrorMessage: () => string
}) {
  const hasInitialLoadError = ref(false)
  const isPositioningForegroundViewport = ref(false)
  const initialLoadError = computed(() =>
    hasInitialLoadError.value ? options.loadErrorMessage() : null,
  )
  let committedScope: LibraryRouteScope | null = null

  function commitLibrarySnapshot(snapshot: LibraryDataSnapshot): void {
    options.pageIdentity.value = snapshot.identity
    options.tracks.value = snapshot.tracks
    options.libraryViewMode.value = snapshot.viewMode
    options.onSnapshotCommitted(snapshot)
  }

  function hasPreviousSnapshot(scope: LibraryRouteScope): boolean {
    return committedScope !== null && isSameLibraryRouteScope(committedScope, scope)
  }

  function recordCommittedScope(scope: LibraryRouteScope): void {
    committedScope = scope
  }

  return {
    hasInitialLoadError,
    initialLoadError,
    isPositioningForegroundViewport,
    commitLibrarySnapshot,
    hasPreviousSnapshot,
    recordCommittedScope,
  }
}
