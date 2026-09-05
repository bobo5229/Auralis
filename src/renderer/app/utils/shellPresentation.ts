import type { VisualStyle } from '@renderer/features/appearance/composables/useVisualStyle'
import type { PlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'

export type ShellPresentation = 'modern' | 'manuscript'

export function resolveShellPresentation(
  displayMode: PlayerDisplayMode,
  visualStyle: VisualStyle,
): ShellPresentation {
  return displayMode !== 'mini' && visualStyle === 'manuscript' ? 'manuscript' : 'modern'
}
