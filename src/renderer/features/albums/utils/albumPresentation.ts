import type { VisualStyle } from '@renderer/features/appearance/composables/useVisualStyle'

export function resolveAlbumPresentation(
  routeName: unknown,
  visualStyle: VisualStyle,
): VisualStyle {
  const supportsSharedPreference = routeName === 'albums' || routeName === 'album-detail'
  return supportsSharedPreference && visualStyle === 'manuscript' ? 'manuscript' : 'modern'
}
