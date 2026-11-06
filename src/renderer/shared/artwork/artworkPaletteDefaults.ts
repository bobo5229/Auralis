import type { ArtworkPalette, RgbColor } from '@renderer/shared/artwork/types'
import { getOklabChroma, rgbToOklab } from '@renderer/shared/color/colorMath'
import { DEFAULT_ARTWORK_ACCENT } from '../color/artworkColorDefaults'

const FALLBACK_ACCENT_RGB: RgbColor = DEFAULT_ARTWORK_ACCENT
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
