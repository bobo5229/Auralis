import { describe, expect, it } from 'vitest'
import { extractArtworkPalette } from './extractArtworkPalette'

function solidPixels(r: number, g: number, b: number, count: number): number[] {
  return Array.from({ length: count }, () => [r, g, b, 255]).flat()
}

describe('extractArtworkPalette color conversion compatibility', () => {
  it.each([
    {
      source: { r: 138, g: 206, b: 0 },
      background: { r: 4, g: 23, b: 0 },
      accent: { r: 107, g: 158, b: 19 },
    },
    {
      source: { r: 20, g: 35, b: 140 },
      background: { r: 1, g: 0, b: 25 },
      accent: { r: 19, g: 17, b: 158 },
    },
  ])('retains the palette for a cover dominated by $source', ({ source, background, accent }) => {
    const pixels = new Uint8ClampedArray([
      ...Array.from({ length: 90 }, () => [source.r, source.g, source.b, 255]).flat(),
      ...Array.from({ length: 10 }, () => [0, 0, 0, 255]).flat(),
    ])
    const result = extractArtworkPalette('color-compatibility', pixels)
    expect(result.background).toEqual(background)
    expect(result.dominant).toEqual(source)
    expect(result.accents[0]).toMatchObject({ sourceRgb: source, rgb: accent, weight: 0.9 })
    expect(result.textTone).toBe('light')
    expect(result.quality).toBe('reduced')
  })

  it('keeps the fallback for transparent artwork and excludes transparent colors', () => {
    expect(
      extractArtworkPalette('transparent', new Uint8ClampedArray([255, 0, 0, 127])),
    ).toMatchObject({ key: 'transparent', quality: 'fallback' })
    const result = extractArtworkPalette(
      'opaque',
      new Uint8ClampedArray([255, 0, 0, 127, 138, 206, 0, 128]),
    )
    expect(result.dominant).toEqual({ r: 138, g: 206, b: 0 })
    expect(result.accents[0].weight).toBe(1)
  })
})

describe('image-q artwork quantization', () => {
  it.each([
    [0, 0, 0],
    [255, 255, 255],
    [128, 128, 128],
    [232, 70, 42],
  ])('retains a single opaque pixel (%i, %i, %i)', (r, g, b) => {
    const result = extractArtworkPalette('one-pixel', new Uint8ClampedArray([r, g, b, 255]))
    expect(result.dominant).toEqual({ r, g, b })
    expect(result.accents).toHaveLength(1)
    expect(result.accents[0]).toMatchObject({ sourceRgb: { r, g, b }, weight: 1 })
    expect(result.quality).toBe('reduced')
  })

  it('counts source pixels for distinct palette colors, rather than assigning equal weights', () => {
    const pixels = new Uint8ClampedArray([
      ...solidPixels(185, 30, 52, 1500),
      ...solidPixels(35, 125, 195, 600),
      ...solidPixels(244, 194, 68, 204),
    ])
    const result = extractArtworkPalette('weighted', pixels)
    expect(result.dominant).toEqual({ r: 185, g: 30, b: 52 })
    expect(result.accents).toHaveLength(3)
    for (const [rgb, count] of [
      [{ r: 185, g: 30, b: 52 }, 1500],
      [{ r: 35, g: 125, b: 195 }, 600],
      [{ r: 244, g: 194, b: 68 }, 204],
    ] as const) {
      expect(
        result.accents.find((color) => JSON.stringify(color.sourceRgb) === JSON.stringify(rgb))
          ?.weight,
      ).toBeCloseTo(count / 2304)
    }
  })

  it('excludes tiny color areas using the existing minimum weight', () => {
    const result = extractArtworkPalette(
      'tiny-area',
      new Uint8ClampedArray([...solidPixels(35, 125, 195, 99), ...solidPixels(232, 70, 42, 1)]),
    )
    expect(result.accents).toHaveLength(1)
    expect(result.accents[0]).toMatchObject({ sourceRgb: { r: 35, g: 125, b: 195 }, weight: 0.99 })
  })

  it('is deterministic across keys and repeated extraction, without mutating source pixels', () => {
    const pixels = new Uint8ClampedArray(
      Array.from({ length: 2304 }, (_, i) => [
        20 + (i % 48) * 2,
        35 + Math.floor(i / 48) * 3,
        90 + (i % 48) * 3,
        255,
      ]).flat(),
    )
    const original = pixels.slice()
    const first = extractArtworkPalette('first', pixels)
    extractArtworkPalette('other', new Uint8ClampedArray(solidPixels(255, 0, 0, 2304)))
    expect(extractArtworkPalette('second', pixels)).toEqual({ ...first, key: 'second' })
    expect(pixels).toEqual(original)
    expect(first.accents.length).toBeGreaterThan(1)
    expect(first.accents.length).toBeLessThanOrEqual(5)
    expect(first.accents.reduce((sum, color) => sum + color.weight, 0)).toBeCloseTo(1)
    for (const color of [
      first.background,
      first.dominant!,
      ...first.accents.map((accent) => accent.rgb),
    ]) {
      expect(
        Object.values(color).every(
          (channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255,
        ),
      ).toBe(true)
    }
  })

  it('keeps empty artwork on the established fallback', () => {
    expect(extractArtworkPalette('empty', new Uint8ClampedArray())).toMatchObject({
      key: 'empty',
      quality: 'fallback',
    })
  })
})
