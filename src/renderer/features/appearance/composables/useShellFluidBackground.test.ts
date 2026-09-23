import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('useShellFluidBackground', () => {
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

  it('defaults to enabled when storage is empty', async () => {
    const { useShellFluidBackground } = await import('./useShellFluidBackground')
    const { shellFluidBackgroundEnabled } = useShellFluidBackground()
    expect(shellFluidBackgroundEnabled.value).toBe(true)
  })

  it('reads an explicit false preference', async () => {
    storage.set('auralis-shell-fluid-background-enabled', 'false')
    const { useShellFluidBackground } = await import('./useShellFluidBackground')
    const { shellFluidBackgroundEnabled } = useShellFluidBackground()
    expect(shellFluidBackgroundEnabled.value).toBe(false)
  })

  it('persists toggles for App and Settings to share', async () => {
    const { useShellFluidBackground } = await import('./useShellFluidBackground')
    const first = useShellFluidBackground()
    first.setShellFluidBackgroundEnabled(false)
    expect(storage.get('auralis-shell-fluid-background-enabled')).toBe('false')

    const second = useShellFluidBackground()
    expect(second.shellFluidBackgroundEnabled.value).toBe(false)

    second.setShellFluidBackgroundEnabled(true)
    expect(storage.get('auralis-shell-fluid-background-enabled')).toBe('true')
    expect(first.shellFluidBackgroundEnabled.value).toBe(true)
  })
})
