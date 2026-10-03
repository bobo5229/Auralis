import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllGlobals())

describe('CD canvas background switch preference', () => {
  it.each(['accent', 'true', 'dominant', 'default', 'false', null])(
    'restores and migrates %s',
    async (saved) => {
      vi.resetModules()
      const storage = new Map<string, string>()
      if (saved !== null) storage.set('auralis-cd-canvas-background', saved)
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      })
      const { useCdCanvasBackground } = await import('./useCdCanvasBackground')
      const { cdCanvasBackgroundEnabled, toggleCdCanvasBackground } = useCdCanvasBackground()
      const enabled = saved === 'accent' || saved === 'true'
      expect(cdCanvasBackgroundEnabled.value).toBe(enabled)
      if (saved !== null) expect(storage.get('auralis-cd-canvas-background')).toBe(String(enabled))
      toggleCdCanvasBackground()
      expect(cdCanvasBackgroundEnabled.value).toBe(!enabled)
      expect(storage.get('auralis-cd-canvas-background')).toBe(String(!enabled))
      toggleCdCanvasBackground()
      expect(cdCanvasBackgroundEnabled.value).toBe(enabled)
    },
  )

  it('keeps toggling usable without storage access', async () => {
    vi.resetModules()
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('unavailable')
      },
      setItem: () => {
        throw new Error('unavailable')
      },
    })
    const { useCdCanvasBackground } = await import('./useCdCanvasBackground')
    const { cdCanvasBackgroundEnabled, toggleCdCanvasBackground } = useCdCanvasBackground()
    expect(cdCanvasBackgroundEnabled.value).toBe(false)
    toggleCdCanvasBackground()
    expect(cdCanvasBackgroundEnabled.value).toBe(true)
  })
})
