import type { VisualStyle } from '@renderer/features/appearance/composables/useVisualStyle'
import type { PlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'

export type PlayerSurfacePresentation = 'modern' | 'manuscript'

/**
 * Resolves the presentation for the persistent player surfaces (Now Playing
 * panel and PlayerBar) inside the ordinary window. Phase 18 only covers the
 * `normal` display mode: fullscreen keeps its own owner (Phase 19) and the
 * Miniplayer stays on the modern baseline (Phase 20). This function only parses
 * presentation — it never reads localStorage, creates state, or mutates
 * `useVisualStyle()` (Phase 18 TECHDOC §5.1).
 */
export function resolvePlayerSurfacePresentation(
  displayMode: PlayerDisplayMode,
  visualStyle: VisualStyle,
): PlayerSurfacePresentation {
  return displayMode === 'normal' && visualStyle === 'manuscript' ? 'manuscript' : 'modern'
}
