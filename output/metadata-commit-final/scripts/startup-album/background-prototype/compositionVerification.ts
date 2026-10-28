import { drawBackground, variants } from './backgrounds'
import { composePattern } from '../../../src/renderer/features/startupAlbum/rendering/backgrounds/composition'
import type { BackgroundPalette } from './palette'
import { cardLayout } from '../../../src/renderer/features/startupAlbum/rendering/cardLayout'

// Real browser Canvas checks; no mocked drawing commands or production API.
export function verifyComposition(palette: BackgroundPalette) {
  const { width, height, cover } = cardLayout
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const c = canvas.getContext('2d', { willReadFrequently: true })!
  const render = (id: (typeof variants)[number]['id'], seed: number) => {
    c.clearRect(0, 0, width, height)
    drawBackground(c, id, palette, seed)
    return c.getImageData(0, 0, width, height).data
  }
  const seeds = [0x12345678, 0x87654321]
  const geometry = variants.map(({ id }) => {
    const first = render(id, seeds[0])
    const replay = render(id, seeds[0])
    const changed = render(id, seeds[1])
    let visiblePixels = 0,
      changedPixels = 0,
      replayMaxDifference = 0,
      replayDifference = 0
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const at = (y * width + x) * 4
        for (let channel = 0; channel < 4; channel++) {
          const delta = Math.abs(first[at + channel] - replay[at + channel])
          replayMaxDifference = Math.max(replayMaxDifference, delta)
          replayDifference += delta
        }
        if (first[at + 3] !== 255) throw Error(`${id}: transparent substrate`)
        // Check the visible perimeter, rather than motifs hidden by the cover.
        if (x < cover.x || x >= cover.x + cover.size || y < 70 || y > 942) {
          visiblePixels++
          if (
            [0, 1, 2].some((channel) => Math.abs(first[at + channel] - changed[at + channel]) > 3)
          )
            changedPixels++
        }
      }
    if (changedPixels < visiblePixels * 0.01)
      throw Error(`${id}: seed did not change visible edge detail`)
    // Canvas filters/compositing can round readback by a few 8-bit units as
    // Chromium changes raster backends. Bound both worst-case and mean error.
    const replayMeanDifference = replayDifference / first.length
    if (replayMaxDifference > 3 || replayMeanDifference > 0.3)
      throw Error(
        `${id}: replay changed beyond raster rounding: max ${replayMaxDifference}, mean ${replayMeanDifference}`,
      )
    return {
      id,
      replayMaxDifference,
      replayMeanDifference,
      opaque: true,
      changedEdgeFraction: changedPixels / visiblePixels,
    }
  })

  c.fillStyle = '#808080'
  c.fillRect(0, 0, width, height)
  composePattern(c, (pattern) => {
    for (let x = 0; x < width; x += 4) {
      pattern.fillStyle = x % 8 ? '#eeeeee' : '#111111'
      pattern.fillRect(x, 0, 4, height)
    }
  })
  const data = c.getImageData(0, 0, width, height).data
  const contrast = (x: number, y: number) => {
    let total = 0
    for (let dx = 1; dx < 16; dx++)
      total += Math.abs(data[(y * width + x + dx) * 4] - data[(y * width + x + dx - 1) * 4])
    return total / 15
  }
  const rail = contrast(2, 130)
  const title = contrast(200, 130)
  const artist = contrast(200, 900)
  if (title >= rail * 0.25 || artist >= rail * 0.25 || rail < 20)
    throw Error('Lettering did not soften high-frequency detail independently of the rail')
  return { seeds, geometry, highFrequencyContrast: { rail, title, artist } }
}
