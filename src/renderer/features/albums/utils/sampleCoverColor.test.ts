import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCoverColorSampler } from './sampleCoverColor'

afterEach(() => vi.unstubAllGlobals())

describe('sampleCoverColor', () => {
  it('samples the correct source pixel when the cover is cropped to fill its box', () => {
    const drawImage = vi.fn()
    const getImageData = vi.fn(() => ({ data: [207, 255, 196, 255] }))
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: () => ({ clearRect: vi.fn(), drawImage, getImageData }),
      }),
    })
    const image = {
      naturalWidth: 800,
      naturalHeight: 400,
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 200 }),
    } as HTMLImageElement
    expect(createCoverColorSampler(image)(60, 120)).toBe('#cfffc4')
    expect(drawImage).toHaveBeenCalledWith(image, 300, 200, 1, 1, 0, 0, 1, 1)
  })
  it('samples the original pixel in a non-square image fitted inside the cover', () => {
    const drawImage = vi.fn()
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: () => ({
          clearRect: vi.fn(),
          drawImage,
          getImageData: () => ({ data: [1, 2, 3, 255] }),
        }),
      }),
    })
    const image = {
      naturalWidth: 800,
      naturalHeight: 400,
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 200 }),
    } as HTMLImageElement
    expect(createCoverColorSampler(image, 'contain')(60, 120)).toBe('#010203')
    expect(drawImage).toHaveBeenCalledWith(image, 200, 200, 1, 1, 0, 0, 1, 1)
    expect(createCoverColorSampler(image, 'contain')(60, 21)).toBeNull()
    expect(drawImage).toHaveBeenCalledTimes(1)
  })
  it('reuses and clears the canvas as the pointer moves', () => {
    const clearRect = vi.fn()
    const drawImage = vi.fn()
    const getImageData = vi
      .fn()
      .mockReturnValueOnce({ data: [207, 255, 196, 255] })
      .mockReturnValueOnce({ data: [18, 52, 86, 255] })
    const createElement = vi.fn(() => ({
      getContext: () => ({ clearRect, drawImage, getImageData }),
    }))
    vi.stubGlobal('document', { createElement })
    const image = {
      naturalWidth: 20,
      naturalHeight: 20,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 20, height: 20 }),
    } as HTMLImageElement
    const sample = createCoverColorSampler(image)
    expect(sample(4, 5)).toBe('#cfffc4')
    expect(sample(6, 7)).toBe('#123456')
    expect(createElement).toHaveBeenCalledTimes(1)
    expect(clearRect).toHaveBeenCalledTimes(2)
    expect(drawImage).toHaveBeenLastCalledWith(image, 6, 7, 1, 1, 0, 0, 1, 1)
  })
  it.each([0, 1, 128, 254])('does not save alpha %s as an opaque color', (alpha) => {
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: () => ({
          clearRect: vi.fn(),
          drawImage: vi.fn(),
          getImageData: () => ({ data: [255, 0, 0, alpha] }),
        }),
      }),
    })
    const image = {
      naturalWidth: 20,
      naturalHeight: 20,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 20, height: 20 }),
    } as HTMLImageElement
    expect(createCoverColorSampler(image)(10, 10)).toBeNull()
  })
  it('reuses a source pixel while still tracking layout and image changes', () => {
    const getImageData = vi.fn(() => ({ data: [18, 52, 86, 255] }))
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: () => ({ clearRect: vi.fn(), drawImage: vi.fn(), getImageData }),
      }),
    })
    let left = 0
    const image = {
      src: 'first',
      naturalWidth: 20,
      naturalHeight: 20,
      getBoundingClientRect: () => ({ left, top: 0, width: 40, height: 40 }),
    } as HTMLImageElement
    const sample = createCoverColorSampler(image)
    expect(sample(10, 10)).toBe('#123456')
    expect(sample(11, 11)).toBe('#123456')
    expect(getImageData).toHaveBeenCalledTimes(1)
    left = 2
    expect(sample(12, 10)).toBe('#123456')
    expect(getImageData).toHaveBeenCalledTimes(1)
    image.src = 'second'
    sample(12, 10)
    expect(getImageData).toHaveBeenCalledTimes(2)
    sample(16, 10)
    expect(getImageData).toHaveBeenCalledTimes(3)
  })
})
