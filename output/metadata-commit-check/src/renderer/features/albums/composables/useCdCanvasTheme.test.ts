import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('useCdCanvasTheme', () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    storage.clear()
    vi.resetModules()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value)
        },
        removeItem: (key: string) => {
          storage.delete(key)
        },
      },
    })
  })

  it('defaults to light when storage is empty', async () => {
    const { useCdCanvasTheme } = await import('./useCdCanvasTheme')
    const { cdCanvasTheme } = useCdCanvasTheme()
    expect(cdCanvasTheme.value).toBe('light')
  })

  it('reads an explicit dark preference', async () => {
    storage.set('auralis-cd-canvas-theme', 'dark')
    const { useCdCanvasTheme } = await import('./useCdCanvasTheme')
    const { cdCanvasTheme } = useCdCanvasTheme()
    expect(cdCanvasTheme.value).toBe('dark')
  })

  it('persists toggles for App and the CD page to share', async () => {
    const { useCdCanvasTheme } = await import('./useCdCanvasTheme')
    const first = useCdCanvasTheme()
    first.setCdCanvasTheme('dark')
    expect(storage.get('auralis-cd-canvas-theme')).toBe('dark')

    const second = useCdCanvasTheme()
    expect(second.cdCanvasTheme.value).toBe('dark')

    second.setCdCanvasTheme('light')
    expect(storage.get('auralis-cd-canvas-theme')).toBe('light')
    expect(first.cdCanvasTheme.value).toBe('light')
  })
})
