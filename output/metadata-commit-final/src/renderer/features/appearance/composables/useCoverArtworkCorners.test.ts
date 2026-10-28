import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))

describe('useCoverArtworkCorners', () => {
  const storage = new Map<string, string>()
  const failedKeys = new Set<string>()

  beforeEach(() => {
    storage.clear()
    failedKeys.clear()
    vi.resetModules()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (failedKeys.has(key)) throw new Error('Write unavailable')
        storage.set(key, value)
      },
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('keeps the existing corner switch and restores the selected radius', async () => {
    storage.set('auralis-cover-artwork-rounded', 'false')
    const { useCoverArtworkCorners } = await import('./useCoverArtworkCorners')
    const settings = useCoverArtworkCorners()

    expect(settings.coverArtworkRounded.value).toBe(false)
    expect(settings.coverArtworkRadius.value).toBe(8)

    settings.setCoverArtworkRadius(16)
    settings.setCoverArtworkRounded(true)
    vi.resetModules()

    const restored = (await import('./useCoverArtworkCorners')).useCoverArtworkCorners()
    expect(restored.coverArtworkRounded.value).toBe(true)
    expect(restored.coverArtworkRadius.value).toBe(16)
  })

  it('tracks failures independently and retries unchanged values without losing live changes', async () => {
    const { useCoverArtworkCorners } = await import('./useCoverArtworkCorners')
    const first = useCoverArtworkCorners()
    const second = useCoverArtworkCorners()
    failedKeys.add('auralis-cover-artwork-radius')
    first.setCoverArtworkRadius(24)
    first.setCoverArtworkRounded(false)
    expect(second.coverArtworkRadius.value).toBe(24)
    expect(second.radiusPersistFailed.value).toBe(true)
    expect(second.roundedPersistFailed.value).toBe(false)
    expect(storage.get('auralis-cover-artwork-radius')).toBeUndefined()
    expect(storage.get('auralis-cover-artwork-rounded')).toBe('false')

    failedKeys.add('auralis-cover-artwork-rounded')
    first.setCoverArtworkRounded(true)
    failedKeys.delete('auralis-cover-artwork-radius')
    first.setCoverArtworkRadius(24)
    expect(second.radiusPersistFailed.value).toBe(false)
    expect(second.roundedPersistFailed.value).toBe(true)
    expect(storage.get('auralis-cover-artwork-radius')).toBe('24')

    failedKeys.clear()
    first.setCoverArtworkRounded(true)
    expect(second.roundedPersistFailed.value).toBe(false)
    expect(storage.get('auralis-cover-artwork-rounded')).toBe('true')
  })

  it('reports failed default writes and keeps them failed after invalid radius input', async () => {
    const { useCoverArtworkCorners, DEFAULT_COVER_ARTWORK_RADIUS } =
      await import('./useCoverArtworkCorners')
    const state = useCoverArtworkCorners()
    state.setCoverArtworkRadius(20)
    state.setCoverArtworkRounded(false)
    failedKeys.add('auralis-cover-artwork-radius')
    failedKeys.add('auralis-cover-artwork-rounded')
    state.setCoverArtworkRounded(true)
    state.setCoverArtworkRadius(DEFAULT_COVER_ARTWORK_RADIUS)
    expect(state.radiusPersistFailed.value).toBe(true)
    expect(state.roundedPersistFailed.value).toBe(true)
    expect(state.coverArtworkRadius.value).toBe(DEFAULT_COVER_ARTWORK_RADIUS)
    expect(state.coverArtworkRounded.value).toBe(true)
    expect(storage.get('auralis-cover-artwork-radius')).toBe('20')
    expect(storage.get('auralis-cover-artwork-rounded')).toBe('false')
    state.setCoverArtworkRadius(25)
    expect(state.radiusPersistFailed.value).toBe(true)
    expect(state.coverArtworkRadius.value).toBe(DEFAULT_COVER_ARTWORK_RADIUS)
  })
})
