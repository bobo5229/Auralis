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

  it('applies a peeked palette synchronously before the async load resolves', async () => {
    const artworkCacheKey = ref<string | null>('cover-sync')
    const peeked = paletteFor('cover-sync')
    const loadPalette = vi.fn(async (key: string) => paletteFor(`loaded-${key}`))

    const { palette } = useArtworkPalette(artworkCacheKey, {
      loadPalette,
      peekPalette: (key) => (key === 'cover-sync' ? peeked : null),
    })

    expect(palette.value).toEqual(peeked)
    await flushPaletteWatch()
    expect(loadPalette).toHaveBeenCalledWith('cover-sync')
    expect(palette.value.key).toBe('loaded-cover-sync')
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

describe('useArtworkPalette retains metal colors while loading', () => {
  function setup(retainPreviousWhileLoading = true) {
    const key = ref<string | null>('old')
    const enabled = ref(true)
    const pending = new Map<
      string,
      { resolve: (palette: ArtworkPalette) => void; reject: () => void }
    >()
    const loadPalette = vi.fn(
      (key: string) =>
        new Promise<ArtworkPalette>((resolve, reject) => {
          pending.set(key, { resolve, reject: () => reject(new Error('load failed')) })
        }),
    )
    const result = useArtworkPalette(key, {
      enabled,
      retainPreviousWhileLoading,
      loadPalette,
      peekPalette: () => null,
    })
    return { ...result, key, enabled, pending, loadPalette }
  }
  it('publishes old → new without an intermediate fallback', async () => {
    const state = setup()
    state.pending.get('old')!.resolve(paletteFor('old'))
    await flushPaletteWatch()
    state.key.value = 'new'
    await flushPaletteWatch()
    expect(state.palette.value.key).toBe('old')
    state.pending.get('new')!.resolve(paletteFor('new'))
    await flushPaletteWatch()
    expect(state.palette.value.key).toBe('new')
  })
  it('preserves the default loading fallback for existing callers', async () => {
    const state = setup(false)
    state.pending.get('old')!.resolve(paletteFor('old'))
    await flushPaletteWatch()
    state.key.value = 'new'
    await flushPaletteWatch()
    expect(state.palette.value).toEqual(FALLBACK_PALETTE)
  })
  it('falls back for missing artwork and ignores its outstanding request', async () => {
    const state = setup()
    state.pending.get('old')!.resolve(paletteFor('old'))
    await flushPaletteWatch()
    state.key.value = 'new'
    await flushPaletteWatch()
    state.key.value = null
    await flushPaletteWatch()
    expect(state.palette.value).toEqual(FALLBACK_PALETTE)
    state.pending.get('new')!.resolve(paletteFor('new'))
    await flushPaletteWatch()
    expect(state.palette.value).toEqual(FALLBACK_PALETTE)
  })
  it.each(['resolved fallback', 'rejection'])('falls back on confirmed %s', async (failure) => {
    const state = setup()
    state.pending.get('old')!.resolve(paletteFor('old'))
    await flushPaletteWatch()
    state.key.value = 'new'
    await flushPaletteWatch()
    if (failure === 'rejection') state.pending.get('new')!.reject()
    else state.pending.get('new')!.resolve({ ...FALLBACK_PALETTE, key: 'new' })
    await flushPaletteWatch()
    expect(state.palette.value.quality).toBe('fallback')
    expect(state.palette.value.key).toBe('new')
  })
  it('ignores a stale result after a rapid track switch', async () => {
    const state = setup()
    state.pending.get('old')!.resolve(paletteFor('old'))
    await flushPaletteWatch()
    state.key.value = 'stale'
    await flushPaletteWatch()
    state.key.value = 'new'
    await flushPaletteWatch()
    state.pending.get('stale')!.resolve(paletteFor('stale'))
    await flushPaletteWatch()
    expect(state.palette.value.key).toBe('old')
    state.pending.get('new')!.resolve(paletteFor('new'))
    await flushPaletteWatch()
    expect(state.palette.value.key).toBe('new')
  })
  it('keeps the last palette when disabled and loads only the current artwork after re-enabling', async () => {
    const state = setup()
    state.pending.get('old')!.resolve(paletteFor('old'))
    await flushPaletteWatch()
    state.key.value = 'stale'
    await flushPaletteWatch()
    state.enabled.value = false
    await flushPaletteWatch()
    state.pending.get('stale')!.resolve(paletteFor('stale'))
    state.key.value = 'new'
    await flushPaletteWatch()
    expect(state.palette.value.key).toBe('old')
    expect(state.loadPalette).toHaveBeenCalledTimes(2)
    state.enabled.value = true
    await flushPaletteWatch()
    expect(state.palette.value.key).toBe('old')
    state.pending.get('new')!.resolve(paletteFor('new'))
    await flushPaletteWatch()
    expect(state.palette.value.key).toBe('new')
  })
})
