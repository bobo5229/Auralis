import type { VisualStyle } from '@renderer/features/appearance/composables/useVisualStyle'
import type { SettingsPresentation } from '../types/settingsPresentation'

export function resolveSettingsPresentation(
  routeName: unknown,
  visualStyle: VisualStyle,
): SettingsPresentation {
  return routeName === 'settings' && visualStyle === 'manuscript' ? 'manuscript' : 'modern'
}
