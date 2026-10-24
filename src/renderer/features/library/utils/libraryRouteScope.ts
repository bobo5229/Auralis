import type { PlaylistChangedEvent } from '@shared/types/playlistEvents'
import type { RecentAddedLibraryRange } from './recentAddedLibrary'

export type LibraryRouteScope =
  | { kind: 'library' }
  | { kind: 'recent-added'; range: RecentAddedLibraryRange }
  | { kind: 'playlist'; id: number }
  | { kind: 'smart-playlist'; id: number }

export function isSameLibraryRouteScope(
  left: LibraryRouteScope,
  right: LibraryRouteScope,
): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === 'library' || right.kind === 'library') return true
  if (left.kind === 'recent-added' || right.kind === 'recent-added') {
    return (
      left.kind === 'recent-added' && right.kind === 'recent-added' && left.range === right.range
    )
  }
  return left.id === right.id
}

export function shouldRefreshLibraryForExternalPlaylistEvent(
  scope: LibraryRouteScope,
  event: PlaylistChangedEvent,
): boolean {
  // A view switch already updates its owner; sidebar ordering does not change track contents.
  if (event.reason === 'view-mode-updated' || event.kind === 'collection') return false
  return (
    (event.kind === 'playlist' && scope.kind === 'playlist') ||
    (event.kind === 'smart' && scope.kind === 'smart-playlist')
  )
}
