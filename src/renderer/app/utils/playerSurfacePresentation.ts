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

/**
 * Whether the persistent player surface is the visible one that should drive
 * visual effects (palette extraction, album tint). Fullscreen and mini own
 * their own pipelines; the underlying PlayerBar must not restart colour work
 * while hidden, even though the presentation resolver reports it as modern
 * (TECHDOC §6.1 risk: opening fullscreen must not keep the hidden bar
 * computing).
 */
export function resolvePlayerVisualEffectsActive(displayMode: PlayerDisplayMode): boolean {
  return displayMode === 'normal'
}

/** Palette / tint gate for the ordinary-window surfaces: the manuscript
 * presentation never extracts palette, and a hidden surface (fullscreen or
 * mini) must not start the palette worker either. */
export function resolvePlayerPaletteEnabled(input: {
  presentation: PlayerSurfacePresentation
  displayMode: PlayerDisplayMode
}): boolean {
  return input.presentation === 'modern' && resolvePlayerVisualEffectsActive(input.displayMode)
}
