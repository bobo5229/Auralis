import { nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { FALLBACK_PALETTE } from '../utils/extractArtworkPalette'
import { useArtworkPalette } from './useArtworkPalette'
import type { ArtworkPalette } from '../types'

function paletteFor(key: string): ArtworkPalette {
  return {
    ...FALLBACK_PALETTE,
    key,
  }
}

async function flushPaletteWatch(): Promise<void> {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

describe('useArtworkPalette enabled contract', () => {
  it('does not start a load while disabled', async () => {
    const artworkCacheKey = ref<string | null>('cover-a')
    const enabled = ref(false)
    const loadPalette = vi.fn(async (key: string) => paletteFor(key))

    const { palette } = useArtworkPalette(artworkCacheKey, { enabled, loadPalette })
    await flushPaletteWatch()

    expect(loadPalette).not.toHaveBeenCalled()
    expect(palette.value).toEqual(FALLBACK_PALETTE)
  })

  it('loads the current key immediately after being re-enabled', async () => {
    const artworkCacheKey = ref<string | null>('cover-b')
    const enabled = ref(false)
    const loadPalette = vi.fn(async (key: string) => paletteFor(key))

    const { palette } = useArtworkPalette(artworkCacheKey, { enabled, loadPalette })
    await flushPaletteWatch()

    enabled.value = true
    await flushPaletteWatch()

    expect(loadPalette).toHaveBeenCalledTimes(1)
    expect(loadPalette).toHaveBeenCalledWith('cover-b')
    expect(palette.value.key).toBe('cover-b')
  })

  it('defaults to enabled so existing callers keep loading', async () => {
    const artworkCacheKey = ref<string | null>('cover-c')
    const loadPalette = vi.fn(async (key: string) => paletteFor(key))

    const { palette } = useArtworkPalette(artworkCacheKey, { loadPalette })
    await flushPaletteWatch()

    expect(loadPalette).toHaveBeenCalledWith('cover-c')
    expect(palette.value.key).toBe('cover-c')
  })

  it('falls back when the current key is missing', async () => {
    const artworkCacheKey = ref<string | null>(null)
    const loadPalette = vi.fn(async (key: string) => paletteFor(key))

    const { palette } = useArtworkPalette(artworkCacheKey, { loadPalette })
    await flushPaletteWatch()

    expect(loadPalette).not.toHaveBeenCalled()
    expect(palette.value).toEqual(FALLBACK_PALETTE)
  })

  it('ignores a stale result after the shell is disabled', async () => {
    const artworkCacheKey = ref<string | null>('cover-d')
    const enabled = ref(true)
    let resolveFirst: ((value: ArtworkPalette) => void) | undefined
    const firstLoad = new Promise<ArtworkPalette>((resolve) => {
      resolveFirst = resolve
    })
    const loadPalette = vi
      .fn()
      .mockImplementationOnce(() => firstLoad)
      .mockImplementation(async (key: string) => paletteFor(key))

    const { palette } = useArtworkPalette(artworkCacheKey, { enabled, loadPalette })
    await flushPaletteWatch()

    enabled.value = false
    resolveFirst?.(paletteFor('stale-d'))
    await flushPaletteWatch()

    expect(palette.value).toEqual(FALLBACK_PALETTE)
  })

  it('ignores a stale result after the artwork key changes', async () => {
    const artworkCacheKey = ref<string | null>('cover-old')
    let resolveFirst: ((value: ArtworkPalette) => void) | undefined
    const firstLoad = new Promise<ArtworkPalette>((resolve) => {
      resolveFirst = resolve
    })
    const loadPalette = vi
      .fn()
      .mockImplementationOnce(() => firstLoad)
      .mockImplementation(async (key: string) => paletteFor(key))

    const { palette } = useArtworkPalette(artworkCacheKey, { loadPalette })
    await flushPaletteWatch()

    artworkCacheKey.value = 'cover-new'
    await flushPaletteWatch()
    resolveFirst?.(paletteFor('cover-old'))
    await flushPaletteWatch()

    expect(palette.value.key).toBe('cover-new')
  })
})
