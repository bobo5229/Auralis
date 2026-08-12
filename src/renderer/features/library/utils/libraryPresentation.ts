import type { VisualStyle } from '@renderer/features/appearance/composables/useVisualStyle'
import type { LibraryPresentation } from '../types/libraryPresentation'

export function resolveLibraryPresentation(
  routeName: unknown,
  visualStyle: VisualStyle,
): LibraryPresentation {
  return routeName === 'library' && visualStyle === 'manuscript' ? 'manuscript' : 'modern'
}
