import { createRenderer, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ArtworkPalette, PlaybackTrack, RgbColor } from '../types'
import { FALLBACK_PALETTE } from '../utils/artworkPaletteDefaults'
import { resolveFullscreenSolidColor } from '../utils/fullscreenSolidColor'
import { useFullscreenSolidBackground } from './useFullscreenSolidBackground'

const host = createRenderer<object, object>({
  patchProp() {},
  insert() {},
  remove() {},
  createElement: () => ({}),
  createText: () => ({}),
  createComment: () => ({}),
  setText() {},
  setElementText() {},
  parentNode: () => null,
  nextSibling: () => null,
})
const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))
const trackFor = (
  id: number,
  album: string | null,
  artworkCacheKey: string | null,
): PlaybackTrack => ({
  id,
  album,
  artworkCacheKey,
  title: `Song ${id}`,
  artist: 'Artist',
  albumArtist: 'Album Artist',
  durationSeconds: 200,
})
const red = { r: 240, g: 30, b: 60 },
  blue = { r: 20, g: 100, b: 220 }
const paletteFor = (key: string, dominant: RgbColor): ArtworkPalette => ({
  ...FALLBACK_PALETTE,
  key,
  quality: 'reduced',
  dominant,
})
async function flush() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}
function mount(
  loadPalette = vi.fn(async (key: string) => paletteFor(key, key === 'red' ? red : blue)),
) {
  const track = ref<PlaybackTrack | null>(trackFor(1, 'Album A', 'red'))
  const enabled = ref(true)
  let background!: ReturnType<typeof useFullscreenSolidBackground>
  const app = host.createApp({
    setup() {
      background = useFullscreenSolidBackground(track, {
        enabled,
        loadPalette,
        peekPalette: () => null,
      })
      return () => null
    },
  })
  app.mount({})
  cleanups.push(() => app.unmount())
  return { track, enabled, background, loadPalette }
}

describe('solid fullscreen album color coordination', () => {
  it('uses dominant source color and pins it across same-album tracks, missing covers and re-entry', async () => {
    const { track, background, enabled, loadPalette } = mount()
    await flush()
    expect(background.value).toEqual(resolveFullscreenSolidColor(red))
    track.value = trackFor(2, 'Album A', 'blue')
    await flush()
    track.value = trackFor(3, 'Album A', null)
    await flush()
    enabled.value = false
    await flush()
    enabled.value = true
    await flush()
    expect(loadPalette.mock.calls.every(([key]) => key === 'red')).toBe(true)
    expect(background.value).toEqual(resolveFullscreenSolidColor(red))
    track.value = trackFor(4, 'Album B', 'blue')
    await flush()
    expect(background.value).toEqual(resolveFullscreenSolidColor(blue))
    track.value = trackFor(5, 'Album A', 'blue')
    await flush()
    expect(background.value).toEqual(resolveFullscreenSolidColor(red))
  })

  it('ignores stale album work and retains the last color while the next album loads', async () => {
    let complete!: (palette: ArtworkPalette) => void
    const load = vi
      .fn(async (key: string) => paletteFor(key, red))
      .mockImplementationOnce(async (key) => paletteFor(key, red))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve
          }),
      )
    const { track, background } = mount(load)
    await flush()
    track.value = trackFor(2, 'Album B', 'blue')
    await flush()
    expect(background.value).toEqual(resolveFullscreenSolidColor(red))
    track.value = trackFor(3, 'Album C', null)
    await flush()
    expect(background.value).toEqual(resolveFullscreenSolidColor(null))
    complete(paletteFor('blue', blue))
    await flush()
    expect(background.value).toEqual(resolveFullscreenSolidColor(null))
  })

  it('adopts a later available cover, separates unknown albums and resets with no track', async () => {
    const { track, background } = mount()
    track.value = trackFor(2, 'Album B', null)
    await flush()
    expect(background.value).toEqual(resolveFullscreenSolidColor(null))
    track.value = trackFor(3, 'Album B', 'blue')
    await flush()
    expect(background.value).toEqual(resolveFullscreenSolidColor(blue))
    track.value = trackFor(4, null, 'red')
    await flush()
    expect(background.value).toEqual(resolveFullscreenSolidColor(red))
    track.value = trackFor(5, null, 'blue')
    await flush()
    expect(background.value).toEqual(resolveFullscreenSolidColor(blue))
    track.value = null
    await flush()
    expect(background.value).toEqual(resolveFullscreenSolidColor(null))
  })

  it('does no extraction while disabled and falls back safely on failure', async () => {
    const load = vi.fn(async () => {
      throw new Error('cover unavailable')
    })
    const { enabled, track, background } = mount(load)
    await flush()
    expect(background.value).toEqual(resolveFullscreenSolidColor(null))
    enabled.value = false
    await flush()
    load.mockClear()
    track.value = trackFor(2, 'Album B', 'blue')
    await flush()
    expect(load).not.toHaveBeenCalled()
    enabled.value = true
    await flush()
    expect(load).toHaveBeenCalledWith('blue')
    expect(background.value).toEqual(resolveFullscreenSolidColor(null))
  })
})
