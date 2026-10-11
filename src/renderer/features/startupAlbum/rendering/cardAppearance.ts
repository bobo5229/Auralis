import { getRelativeLuminance } from '../../../shared/color/colorMath'
import { cardLayout } from './cardLayout'
import { randomPatternSeed } from './backgrounds/variation'
import { hasBrightSurface, randomBackground, type BackgroundId } from './backgrounds/backgrounds'
import {
  extractBackgroundPalette,
  getRedSurfaceStrength,
  neutralPalette,
  type BackgroundPalette,
} from './backgrounds/palette'

export interface CardAppearance {
  background: BackgroundId
  palette: BackgroundPalette
  redSurface: number
  patternSeed: number
}

export function createCardAppearance(
  cover: CanvasImageSource | null,
  background: BackgroundId = randomBackground(),
  patternSeed: number = randomPatternSeed(),
): CardAppearance {
  let palette = neutralPalette()
  try {
    if (cover) palette = extractBackgroundPalette(cover)
  } catch {
    // Readback can fail even for a decoded cover. Keep the card usable.
  }
  return {
    background,
    palette,
    redSurface: hasBrightSurface(background) ? getRedSurfaceStrength(palette) : 0,
    patternSeed: patternSeed >>> 0,
  }
}

export function cardTextColors(
  c: CanvasRenderingContext2D,
  warm: boolean,
  area: 'header' | 'footer' | { x: number; y: number; width: number; height: number } = 'header',
) {
  const scale = c.canvas.width / 720
  const region = typeof area === 'string' ? cardLayout[area] : area
  const sample = c.getImageData(
    region.x * scale,
    region.y * scale,
    region.width * scale,
    region.height * scale,
  )
  const luminances: number[] = []
  const step = Math.max(1, Math.round(6 * scale))
  for (let y = 0; y < sample.height; y += step)
    for (let x = 0; x < sample.width; x += step) {
      const offset = (y * sample.width + x) * 4
      luminances.push(
        getRelativeLuminance({
          r: sample.data[offset],
          g: sample.data[offset + 1],
          b: sample.data[offset + 2],
        }),
      )
    }
  // Compare the weaker fifth of each candidate's contrast. A bright stripe
  // elsewhere in the header must not turn lettering over a dark area black.
  luminances.sort((a, b) => a - b)
  const low = luminances[Math.floor((luminances.length - 1) * 0.2)] ?? 0
  const high = luminances[Math.floor((luminances.length - 1) * 0.8)] ?? 0
  const dark = (low + 0.05) / 0.065 > 0.95 / (high + 0.05)
  return {
    primary: dark ? '#231f29' : warm ? '#fff1f2' : '#f0f3f7',
    secondary: dark ? '#292430' : warm ? '#f4dce1' : '#d0dce9',
  }
}
