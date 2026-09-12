import type { LibrarySurfaceKind } from '../types/libraryPageIdentity'

const libraryRoutes = new Set<LibrarySurfaceKind>(['library', 'playlist', 'smart-playlist'])

export function resolveLibrarySurfaceKind(routeName: unknown): LibrarySurfaceKind | null {
  return typeof routeName === 'string' && libraryRoutes.has(routeName as LibrarySurfaceKind)
    ? (routeName as LibrarySurfaceKind)
    : null
}
