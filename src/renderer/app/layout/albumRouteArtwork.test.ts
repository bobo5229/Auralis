import { afterEach, describe, expect, it, vi } from 'vitest'
import { animateAlbumRouteArtwork } from './albumRouteArtwork'

function fixture() {
  const rect = (left: number, top: number, width: number, height: number) =>
    ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect
  const animation = () => ({ cancel: vi.fn() }) as unknown as Animation
  const image = { complete: true, naturalWidth: 600, currentSrc: 'cover', src: 'cover' }
  const cloneImage = { style: {} }
  const clone = {
    style: {},
    setAttribute: vi.fn(),
    querySelector: () => cloneImage,
    animate: vi.fn<(frames: Keyframe[], options: KeyframeAnimationOptions) => Animation>(() =>
      animation(),
    ),
    remove: vi.fn(),
  }
  const small = {
    style: { opacity: '0.8' },
    querySelector: () => image,
    getBoundingClientRect: () => rect(100, 100, 120, 120),
    animate: vi.fn(() => animation()),
  }
  const large = {
    style: { opacity: '0.9' },
    querySelector: () => image,
    getBoundingClientRect: () => rect(300, 40, 500, 500),
    cloneNode: () => clone,
    animate: vi.fn(() => animation()),
  }
  const card = { dataset: { albumKey: 'selected' }, querySelector: () => small }
  const list = {
    querySelectorAll: () => [card],
    querySelector: () => ({ getBoundingClientRect: () => rect(50, 50, 1000, 700) }),
  }
  const detail = {
    querySelector: () => large,
    getBoundingClientRect: () => rect(280, 0, 900, 800),
  }
  const append = vi.fn()
  vi.stubGlobal('document', { body: { append } })
  vi.stubGlobal('window', { innerWidth: 1200, innerHeight: 800 })
  return {
    list: list as unknown as HTMLElement,
    detail: detail as unknown as HTMLElement,
    small,
    large,
    clone,
    image,
    append,
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('album route artwork', () => {
  it.each([false, true])('uses transform and restores both covers after reverse=%s', (reverse) => {
    const f = fixture()
    const transition = animateAlbumRouteArtwork(f.list, f.detail, 'selected', reverse)
    expect(transition?.animations).toHaveLength(2)
    expect(f.append).toHaveBeenCalledWith(f.clone)
    expect(f.small.style.opacity).toBe('0')
    expect(f.large.style.opacity).toBe('0')
    const frames = f.clone.animate.mock.calls[0]?.[0] as unknown as Keyframe[]
    expect(
      frames.every((frame) =>
        Object.keys(frame).every((key) => ['transform', 'opacity', 'offset'].includes(key)),
      ),
    ).toBe(true)
    expect(frames.some((frame) => String(frame.transform).includes('scale('))).toBe(true)
    transition?.cleanup()
    expect(f.small.style.opacity).toBe('0.8')
    expect(f.large.style.opacity).toBe('0.9')
    expect(f.clone.remove).toHaveBeenCalledOnce()
  })

  it('falls back when the album card or decoded cover is unavailable', () => {
    const f = fixture()
    expect(animateAlbumRouteArtwork(f.list, f.detail, 'other', false)).toBeNull()
    f.image.complete = false
    expect(animateAlbumRouteArtwork(f.list, f.detail, 'selected', false)).toBeNull()
    expect(f.append).not.toHaveBeenCalled()
  })
})
