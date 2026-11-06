import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { analyzeArtworkColors } from '@renderer/shared/artwork/artworkAnalysis'
import { refineArtworkPalette } from '@renderer/shared/artwork/refineArtworkPalette'
import { getOklabChroma, rgbToOklab } from '@renderer/shared/color/colorMath'
import { extractArtworkPalette } from '@renderer/shared/artwork/extractArtworkPalette'

async function sample(
  name: string,
  directory = 'demo/albums/selection-patch',
): Promise<Uint8ClampedArray> {
  const file = await readFile(resolve(directory, name))
  const pixels = await sharp(file).resize(48, 48, { fit: 'fill' }).ensureAlpha().raw().toBuffer()
  return Uint8ClampedArray.from(pixels)
}

function sampleWithCornerAccent(): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(48 * 48 * 4)
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++) {
      const i = (y * 48 + x) * 4
      const corner = x < 8 && y < 8
      pixels.set(corner ? [255, 0, 0, 255] : [153, 153, 153, 255], i)
    }
  return pixels
}

describe('shared palette refinement', () => {
  it('selects a central cyan for Doja and uses it consistently as the first accent', async () => {
    const pixels = await sample('doja.jpg')
    const original = analyzeArtworkColors(pixels)!
    const result = extractArtworkPalette('doja', pixels)
    expect(result.dominant).not.toEqual(original.dominant.rgb)
    expect(result.dominant!.g).toBeGreaterThan(result.dominant!.r + 50)
    expect(result.dominant!.b).toBeGreaterThan(result.dominant!.r + 50)
    expect(result.accents[0].sourceRgb).toEqual(result.dominant)
    expect(result.accents[0].weight).toBeGreaterThanOrEqual(0.035)
  })

  it('combines fragmented pink shades against a dark background', async () => {
    const pixels = await sample('pink-pony-club.jpg', 'demo/albums/color-family-study')
    const baseline = analyzeArtworkColors(pixels)!
    const result = extractArtworkPalette('pink-pony', pixels)
    expect(result.dominant).not.toEqual(baseline.dominant.rgb)
    expect(result.dominant!.r).toBeGreaterThan(result.dominant!.g + 40)
    expect(result.dominant!.r).toBeGreaterThan(result.dominant!.b + 40)
    expect(result.accents[0].sourceRgb).toEqual(result.dominant)
    expect(result.accents[0].weight).toBeGreaterThanOrEqual(0.07)
  })

  it.each(['white-album.jpg', 'unknown-pleasures.jpg'])(
    'keeps the current palette for a monochrome cover: %s',
    async (filename) => {
      const pixels = await sample(filename, 'demo/playback/palette-comparison/assets')
      const baseline = analyzeArtworkColors(pixels)!
      expect(refineArtworkPalette(pixels, baseline)).toBe(baseline)
    },
  )

  it('keeps Lover unchanged', async () => {
    const pixels = await sample('lover.jpg')
    const baseline = analyzeArtworkColors(pixels)!
    expect(refineArtworkPalette(pixels, baseline)).toBe(baseline)
    expect(extractArtworkPalette('lover', pixels).dominant).toEqual(baseline.dominant.rgb)
  })

  it('allows a substantial central cyan when the original brown is nearly neutral', () => {
    const pixels = new Uint8ClampedArray(48 * 48 * 4)
    for (let y = 0; y < 48; y++) {
      for (let x = 0; x < 48; x++) {
        pixels.set(
          x >= 19 && x < 29 && y >= 19 && y < 29 ? [120, 212, 205, 255] : [159, 143, 131, 255],
          (y * 48 + x) * 4,
        )
      }
    }
    const rgb = { r: 159, g: 143, b: 131 }
    const oklab = rgbToOklab(rgb)
    const source = { rgb, oklab, chroma: getOklabChroma(oklab), weight: 1 }
    const baseline = { dominant: source, colors: [source] }
    expect(source.chroma).toBeGreaterThan(0.025)
    expect(source.chroma).toBeLessThan(0.03)
    const refined = refineArtworkPalette(pixels, baseline)
    expect(refined.dominant.rgb.g).toBeGreaterThan(refined.dominant.rgb.r + 50)
    expect(refined.dominant.rgb.b).toBeGreaterThan(refined.dominant.rgb.r + 50)

    // A clearly tinted brown still keeps its unrelated cyan accent from taking over.
    const brownLab = { l: oklab.l, a: 0.04, b: 0.02 }
    const tinted = { ...source, oklab: brownLab, chroma: getOklabChroma(brownLab) }
    const tintedBaseline = { dominant: tinted, colors: [tinted] }
    expect(refineArtworkPalette(pixels, tintedBaseline)).toBe(tintedBaseline)
  })

  it('does not promote a small colored corner or reinterpret non-48-by-48 inputs', () => {
    const pixels = sampleWithCornerAccent()
    const baseline = analyzeArtworkColors(pixels)!
    expect(refineArtworkPalette(pixels, baseline)).toBe(baseline)
    const small = new Uint8ClampedArray([128, 128, 128, 255])
    const baselineSmall = analyzeArtworkColors(small)!
    expect(refineArtworkPalette(small, baselineSmall)).toBe(baselineSmall)
  })
})
