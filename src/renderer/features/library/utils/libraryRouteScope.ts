export type LibraryRouteScope =
  | { kind: 'library' }
  | { kind: 'playlist'; id: number }
  | { kind: 'smart-playlist'; id: number }

export function isSameLibraryRouteScope(
  left: LibraryRouteScope,
  right: LibraryRouteScope,
): boolean {
  if (left.kind !== right.kind) return false
  if (left.kind === 'library' || right.kind === 'library') return true
  return left.id === right.id
}
