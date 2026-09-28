import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))

describe('useCoverArtworkCorners', () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    storage.clear()
    vi.resetModules()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    })
  })

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
})
