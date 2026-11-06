import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { compareArtworkColors as compareRepresentative } from './representativeArtworkColor'
import { analyzeArtworkColors } from './artworkAnalysis'
import { refineArtworkPalette } from './refineArtworkPalette'
import { extractArtworkPalette } from '@renderer/shared/artwork/extractArtworkPalette'

function compareArtworkColors(pixels: Uint8ClampedArray) {
  const analysis = analyzeArtworkColors(pixels)!
  return compareRepresentative(pixels, analysis, refineArtworkPalette(pixels, analysis).dominant)
}

async function sample(path: string): Promise<Uint8ClampedArray> {
  const bytes = await readFile(resolve(path))
  return new Uint8ClampedArray(await sharp(bytes).resize(48, 48).ensureAlpha().raw().toBuffer())
}

describe('experimental representative cover colors', () => {
  it.each([
    'demo/albums/selection-patch/doja.jpg',
    'demo/albums/selection-patch/lover.jpg',
    'demo/albums/color-family-study/pink-pony-club.jpg',
    'demo/playback/palette-comparison/assets/white-album.jpg',
    'demo/playback/palette-comparison/assets/unknown-pleasures.jpg',
    'demo/playback/palette-comparison/assets/1989.jpg',
    'demo/playback/palette-comparison/assets/abbey-road.jpg',
    'demo/playback/palette-comparison/assets/kind-of-blue.jpg',
    'demo/playback/palette-comparison/assets/melodrama.jpg',
    'demo/playback/palette-comparison/assets/post.jpg',
  ])('preserves the established result for %s', async (path) => {
    const result = compareArtworkColors(await sample(path))!
    expect(result.proposed.rgb).toEqual(result.current.rgb)
  })

  it('prefers a substantial bright backdrop over a muted foreground', () => {
    const pixels = new Uint8ClampedArray(48 * 48 * 4)
    for (let i = 0; i < 48 * 48; i++) {
      pixels.set(i < 1350 ? [126, 106, 67, 255] : [207, 255, 196, 255], i * 4)
    }
    const result = compareArtworkColors(pixels)!
    expect(result.reason).toBe('bright-background')
    expect(result.proposed.rgb.g).toBeGreaterThan(result.proposed.rgb.r)
    expect(extractArtworkPalette('bright', pixels).dominant).toEqual(result.proposed.rgb)
  })

  it('keeps the dark backdrop when many vivid hues compete', () => {
    const pixels = new Uint8ClampedArray(48 * 48 * 4)
    const colors = [
      [255, 0, 0],
      [255, 128, 0],
      [255, 255, 0],
      [0, 200, 0],
      [0, 220, 220],
      [0, 60, 220],
      [150, 0, 220],
      [255, 0, 160],
    ]
    for (let y = 0; y < 48; y++)
      for (let x = 0; x < 48; x++) {
        const rgb =
          x >= 9 && x < 39 && y >= 9 && y < 39
            ? colors[Math.floor((x - 9) / 4) % colors.length]
            : [0, 0, 0]
        pixels.set([...rgb, 255], (y * 48 + x) * 4)
      }
    const result = compareArtworkColors(pixels)!
    expect(result.reason).toBe('dark-diverse')
    expect(result.proposed.rgb.r).toBeLessThan(20)
    expect(result.proposed.rgb.g).toBeLessThan(20)
    expect(result.proposed.rgb.b).toBeLessThan(20)
    expect(extractArtworkPalette('dark', pixels).dominant).toEqual(result.proposed.rgb)
  })
})
