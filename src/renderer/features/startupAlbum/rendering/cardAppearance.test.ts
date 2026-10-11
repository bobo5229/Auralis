import { afterEach, describe, expect, it, vi } from 'vitest'
import { rgbToOklab } from '../../../shared/color/colorMath'
import { cardTextColors, createCardAppearance } from './cardAppearance'
import { randomBackground, variants } from './backgrounds/backgrounds'
import {
  extractBackgroundPalette,
  getRedSurfaceStrength,
  neutralPalette,
  tone,
} from './backgrounds/palette'

afterEach(() => vi.unstubAllGlobals())

function pixels(r: number, g: number, b: number, a = 255) {
  const data = new Uint8ClampedArray(48 * 48 * 4)
  for (let i = 0; i < data.length; i += 4) data.set([r, g, b, a], i)
  const drawImage = vi.fn()
  vi.stubGlobal('document', {
    createElement: () => ({
      getContext: () => ({ drawImage, getImageData: () => ({ data }) }),
    }),
  })
  return drawImage
}

describe('startup card appearance', () => {
  it('randomly reaches all seven backgrounds', () => {
    expect(variants.map((_, i) => randomBackground(() => (i + 0.5) / variants.length))).toEqual(
      variants.map(({ id }) => id),
    )
    expect(randomBackground(() => 0)).toBe('glass')
    expect(randomBackground(() => 0.999999)).toBe('flow')
  })

  it('uses source cover colour rather than the adjusted playback accent', () => {
    const draw = pixels(237, 0, 17)
    const cover = {} as CanvasImageSource
    const palette = extractBackgroundPalette(cover)
    expect(draw).toHaveBeenCalledWith(cover, 0, 0, 48, 48)
    expect(palette.quality).toBe('cover')
    expect(palette.primary.l).toBeCloseTo(rgbToOklab({ r: 237, g: 0, b: 17 }).l, 2)
    expect(getRedSurfaceStrength(palette)).toBeGreaterThan(0.95)
    const appearance = createCardAppearance(cover, 'paper')
    expect(appearance.background).toBe('paper')
    expect(appearance.redSurface).toBeGreaterThan(0.95)
    expect(createCardAppearance(cover, 'glass').redSurface).toBe(0)
  })

  it.each([
    [199, 71, 33],
    [0, 130, 230],
    [30, 160, 80],
  ])('keeps nonred source %s/%s/%s outside the red treatment', (r, g, b) => {
    pixels(r, g, b)
    expect(getRedSurfaceStrength(extractBackgroundPalette({} as CanvasImageSource))).toBe(0)
  })

  it.each([0, 128, 255])('keeps neutral %s covers achromatic', (value) => {
    pixels(value, value, value)
    const palette = extractBackgroundPalette({} as CanvasImageSource)
    expect(palette.quality).toBe('neutral')
    expect(palette.primary.a).toBe(0)
    expect(palette.primary.b).toBe(0)
    expect(getRedSurfaceStrength(palette)).toBe(0)
    const channels = tone(palette, '#526979', 'bright-surface')
      .match(/[\d.]+/g)!
      .map(Number)
    expect(channels[0]).toBe(channels[1])
    expect(channels[1]).toBe(channels[2])
  })

  it('uses a neutral fallback for transparent or missing artwork', () => {
    pixels(237, 0, 17, 0)
    expect(extractBackgroundPalette({} as CanvasImageSource)).toEqual(neutralPalette())
    expect(createCardAppearance(null, 'flow').palette).toEqual(neutralPalette())
  })

  it('does not block the card when pixel readback fails', () => {
    vi.stubGlobal('document', {
      createElement: () => {
        throw new Error('readback denied')
      },
    })
    expect(createCardAppearance({} as CanvasImageSource, 'terrain', 123)).toEqual({
      background: 'terrain',
      palette: neutralPalette(),
      redSurface: 0,
      patternSeed: 123,
    })
  })

  it('retains an explicit pattern seed independently of cover colour', () => {
    pixels(237, 0, 17)
    const warm = createCardAppearance({} as CanvasImageSource, 'glass', 0x12345678)
    pixels(0, 130, 230)
    const cool = createCardAppearance({} as CanvasImageSource, 'glass', 0x12345678)
    expect(warm.patternSeed).toBe(cool.patternSeed)
    expect(warm.palette).not.toEqual(cool.palette)
  })

  it('chooses a fresh seed for a new presentation', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.9)
    try {
      const first = createCardAppearance(null, 'glass')
      const second = createCardAppearance(null, 'glass')
      expect(first.patternSeed).not.toBe(second.patternSeed)
    } finally {
      random.mockRestore()
    }
  })

  it('chooses lettering contrast from its bounds despite bright motifs elsewhere', () => {
    const getImageData = vi.fn((x: number, _y: number, width: number, height: number) => {
      const data = new Uint8ClampedArray(width * height * 4)
      for (let y = 0; y < height; y++)
        for (let i = 0; i < width; i++) {
          const value = x + i < 300 ? 65 : 240
          data.set([value, value, value, 255], (y * width + i) * 4)
        }
      return { width, height, data }
    })
    const c = { canvas: { width: 720 }, getImageData } as unknown as CanvasRenderingContext2D
    expect(cardTextColors(c, false, { x: 38, y: 70, width: 250, height: 60 }).primary).toBe(
      '#f0f3f7',
    )
    expect(cardTextColors(c, false, { x: 400, y: 920, width: 280, height: 60 }).secondary).toBe(
      '#292430',
    )
  })
})
