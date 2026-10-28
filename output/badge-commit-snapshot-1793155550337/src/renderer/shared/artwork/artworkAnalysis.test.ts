import { expect, it } from 'vitest'
import { analyzeArtworkColors } from './artworkAnalysis'
import { getOklabChroma, rgbToOklab } from '../color/colorMath'

it('reports source colors without a screen-specific brightness or saturation adjustment', () => {
  const source = { r: 35, g: 125, b: 195 }
  const result = analyzeArtworkColors(new Uint8ClampedArray([35, 125, 195, 255]))!
  expect(result.dominant.rgb).toEqual(source)
  expect(result.colors).toEqual([
    {
      rgb: source,
      oklab: rgbToOklab(source),
      chroma: getOklabChroma(rgbToOklab(source)),
      weight: 1,
    },
  ])
})

it('has no analysis for empty or fully transparent pixels and leaves the source buffer intact', () => {
  expect(analyzeArtworkColors(new Uint8ClampedArray())).toBeNull()
  const pixels = new Uint8ClampedArray([255, 0, 0, 127])
  expect(analyzeArtworkColors(pixels)).toBeNull()
  expect([...pixels]).toEqual([255, 0, 0, 127])
})
