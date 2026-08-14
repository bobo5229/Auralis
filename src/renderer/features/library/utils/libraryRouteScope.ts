export type LibraryRouteScope =
  | { kind: 'library' }
  | { kind: 'playlist'; id: number }
  | { kind: 'smart-playlist'; id: number }

export const LIBRARY_PLAYLISTS_CHANGED_EVENT = 'auralis-playlists-changed'
export const LIBRARY_SMART_PLAYLISTS_CHANGED_EVENT = 'auralis-smart-playlists-changed'

export function isSameLibraryRouteScope(
  left: LibraryRouteScope,
  right: LibraryRouteScope,
): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === 'library' || right.kind === 'library') return true
  return left.id === right.id
}

export function shouldRefreshLibraryForExternalPlaylistEvent(
  scope: LibraryRouteScope,
  eventName: string,
): boolean {
  if (eventName === LIBRARY_PLAYLISTS_CHANGED_EVENT) return scope.kind === 'playlist'
  if (eventName === LIBRARY_SMART_PLAYLISTS_CHANGED_EVENT) return scope.kind === 'smart-playlist'
  return false
}
