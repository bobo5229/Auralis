import type { ArtworkPalette, RgbColor } from '../types'
import { getOklabChroma, rgbToOklab } from './colorSpace'
import { PLAYER_DEFAULT_ACCENT_DARK } from './playerColorDefaults'

const FALLBACK_ACCENT_RGB: RgbColor = PLAYER_DEFAULT_ACCENT_DARK
const FALLBACK_ACCENT_OKLAB = rgbToOklab(FALLBACK_ACCENT_RGB)

export const FALLBACK_PALETTE: ArtworkPalette = {
  key: 'fallback',
  background: { r: 14, g: 17, b: 23 },
  accents: [
    {
      rgb: FALLBACK_ACCENT_RGB,
      oklab: FALLBACK_ACCENT_OKLAB,
      weight: 1,
      chroma: getOklabChroma(FALLBACK_ACCENT_OKLAB),
    },
  ],
  textTone: 'light',
  quality: 'fallback',
}
