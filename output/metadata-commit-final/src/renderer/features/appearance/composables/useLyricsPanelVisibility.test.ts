import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))

describe('useLyricsPanelVisibility', () => {
  const storage = new Map<string, string>()
  const key = 'auralis-lyrics-panel-expanded'

  beforeEach(() => {
    storage.clear()
    vi.resetModules()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('uses the expanded layout by default', async () => {
    const { useLyricsPanelVisibility } = await import('./useLyricsPanelVisibility')
    expect(useLyricsPanelVisibility().lyricsPanelExpanded.value).toBe(true)
  })

  it('preserves an explicitly saved collapsed layout', async () => {
    storage.set(key, 'false')
    const { useLyricsPanelVisibility } = await import('./useLyricsPanelVisibility')
    expect(useLyricsPanelVisibility().lyricsPanelExpanded.value).toBe(false)
  })

  it('shares live changes and restores them after module reload', async () => {
    const { useLyricsPanelVisibility } = await import('./useLyricsPanelVisibility')
    const viewA = useLyricsPanelVisibility()
    const viewB = useLyricsPanelVisibility()
    viewA.setLyricsPanelExpanded(false)
    expect(viewB.lyricsPanelExpanded.value).toBe(false)
    expect(storage.get(key)).toBe('false')

    vi.resetModules()
    const restored = (await import('./useLyricsPanelVisibility')).useLyricsPanelVisibility()
    expect(restored.lyricsPanelExpanded.value).toBe(false)
    restored.setLyricsPanelExpanded(true)
    expect(storage.get(key)).toBe('true')
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
    const { useLyricsPanelVisibility } = await import('./useLyricsPanelVisibility')
    const state = useLyricsPanelVisibility()
    expect(state.lyricsPanelExpanded.value).toBe(true)
    state.setLyricsPanelExpanded(false)
    expect(state.lyricsPanelExpanded.value).toBe(false)
    const { rendererDiagnostics } = await import('@renderer/shared/diagnostics/rendererDiagnostics')
    expect(rendererDiagnostics.warn).toHaveBeenCalled()
  })
})
