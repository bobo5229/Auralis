import type { PlaybarLayout } from '@renderer/features/appearance/composables/usePlaybarLayout'
import type { PlaybarStyle } from '@renderer/features/appearance/composables/usePlaybarStyle'

/** The liquid material is the floating island only. Full width keeps the plain surface. */
export function isPlaybarLiquidSurface(style: PlaybarStyle, layout: PlaybarLayout): boolean {
  return style === 'liquid' && layout === 'island'
}
