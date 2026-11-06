export type { RgbColor, OklabColor } from '@renderer/shared/color/types'
import type { RgbColor } from '@renderer/shared/color/types'
import type { ArtworkColor } from './artworkAnalysis'

export interface PaletteColor extends ArtworkColor {
  /** Extracted cluster color before display tone mapping. */
  sourceRgb?: RgbColor
}

export interface ArtworkPalette {
  key: string
  /** Representative source color selected by area-led scoring, before display tone mapping. */
  dominant?: RgbColor
  background: RgbColor
  accents: PaletteColor[]
  textTone: 'light' | 'dark'
  quality: 'full' | 'reduced' | 'fallback'
}
