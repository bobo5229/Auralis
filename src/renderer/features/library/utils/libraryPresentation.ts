import type { VisualStyle } from '@renderer/features/appearance/composables/useVisualStyle'
import type { LibraryPresentation, LibrarySurfaceKind } from '../types/libraryPresentation'

const manuscriptLibraryRoutes = new Set<LibrarySurfaceKind>([
  'library',
  'playlist',
  'smart-playlist',
])

export function resolveLibrarySurfaceKind(routeName: unknown): LibrarySurfaceKind | null {
  if (typeof routeName !== 'string') return null
  return manuscriptLibraryRoutes.has(routeName as LibrarySurfaceKind)
    ? (routeName as LibrarySurfaceKind)
    : null
}

export function resolveLibraryPresentation(
  routeName: unknown,
  visualStyle: VisualStyle,
): LibraryPresentation {
  return visualStyle === 'manuscript' && resolveLibrarySurfaceKind(routeName) !== null
    ? 'manuscript'
    : 'modern'
}
