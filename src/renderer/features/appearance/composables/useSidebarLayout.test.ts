import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))

describe('useSidebarLayout', () => {
  const storage = new Map<string, string>()
  const key = 'auralis-sidebar-full-height'
  const collapsedKey = 'auralis-sidebar-collapsed'

  beforeEach(() => {
    storage.clear()
    vi.resetModules()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('uses the full-height layout by default', async () => {
    const { useSidebarLayout } = await import('./useSidebarLayout')
    expect(useSidebarLayout().sidebarFullHeight.value).toBe(true)
  })

  it('uses the expanded sidebar by default', async () => {
    const { useSidebarLayout } = await import('./useSidebarLayout')
    expect(useSidebarLayout().sidebarCollapsed.value).toBe(false)
  })

  it('preserves an explicitly saved floating layout', async () => {
    storage.set(key, 'false')
    const { useSidebarLayout } = await import('./useSidebarLayout')
    expect(useSidebarLayout().sidebarFullHeight.value).toBe(false)
  })

  it('preserves an explicitly saved collapsed state', async () => {
    storage.set(collapsedKey, 'true')
    const { useSidebarLayout } = await import('./useSidebarLayout')
    expect(useSidebarLayout().sidebarCollapsed.value).toBe(true)
  })

  it('shares live changes and restores them after module reload', async () => {
    const { useSidebarLayout } = await import('./useSidebarLayout')
    const settings = useSidebarLayout()
    const sidebar = useSidebarLayout()
    settings.setSidebarFullHeight(true)
    expect(sidebar.sidebarFullHeight.value).toBe(true)
    expect(storage.get(key)).toBe('true')

    vi.resetModules()
    const restored = (await import('./useSidebarLayout')).useSidebarLayout()
    expect(restored.sidebarFullHeight.value).toBe(true)
    restored.setSidebarFullHeight(false)
    expect(storage.get(key)).toBe('false')
  })

  it('persists collapsed changes independently from the layout mode', async () => {
    const { useSidebarLayout } = await import('./useSidebarLayout')
    const settings = useSidebarLayout()
    const sidebar = useSidebarLayout()

    settings.setSidebarCollapsed(true)
    expect(sidebar.sidebarCollapsed.value).toBe(true)
    expect(storage.get(collapsedKey)).toBe('true')
    expect(storage.has(key)).toBe(false)
    expect(sidebar.sidebarFullHeight.value).toBe(true)

    settings.setSidebarFullHeight(false)
    expect(sidebar.sidebarCollapsed.value).toBe(true)
    expect(sidebar.sidebarFullHeight.value).toBe(false)

    vi.resetModules()
    const restored = (await import('./useSidebarLayout')).useSidebarLayout()
    expect(restored.sidebarCollapsed.value).toBe(true)
    expect(restored.sidebarFullHeight.value).toBe(false)
  })

  it('reports storage failure while keeping the current session usable', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Storage unavailable')
      },
      setItem: () => {
        throw new Error('Storage unavailable')
      },
    })
    const { useSidebarLayout } = await import('./useSidebarLayout')
    const state = useSidebarLayout()
    expect(state.sidebarFullHeight.value).toBe(true)
    expect(state.sidebarCollapsed.value).toBe(false)
    state.setSidebarFullHeight(false)
    state.setSidebarCollapsed(true)
    expect(state.sidebarFullHeight.value).toBe(false)
    expect(state.sidebarCollapsed.value).toBe(true)
    const { rendererDiagnostics } = await import('@renderer/shared/diagnostics/rendererDiagnostics')
    expect(rendererDiagnostics.warn).toHaveBeenCalled()
  })
})
