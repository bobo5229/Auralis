import type { PlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'

/** Hidden PlayerBar surfaces must not start artwork, tint, canvas, or glass work. */
export function isPlayerVisualEffectsActive(displayMode: PlayerDisplayMode): boolean {
  return displayMode === 'normal'
}
