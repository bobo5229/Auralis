import type { VisualStyle } from '@renderer/features/appearance/composables/useVisualStyle'

export function resolveArchivePresentation(
  routeName: unknown,
  visualStyle: VisualStyle,
): VisualStyle {
  return routeName === 'archive' && visualStyle === 'manuscript' ? 'manuscript' : 'modern'
}
