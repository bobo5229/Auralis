import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))

describe('useLyricsPanelWidth', () => {
  const storage = new Map<string, string>()
  const key = 'auralis-lyrics-panel-width'

  beforeEach(() => {
    storage.clear()
    vi.resetModules()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it.each<[string | undefined, number]>([
    [undefined, 0],
    ['0', 0],
    ['', 0],
    ['invalid', 0],
    ['Infinity', 0],
    ['-10', 0],
    ['120', 240],
    ['900', 640],
    ['351.6', 352],
  ])('restores preference %s as %s without overwriting storage', async (saved, expected) => {
    if (saved !== undefined) storage.set(key, saved)
    const { useLyricsPanelWidth } = await import('./useLyricsPanelWidth')
    expect(useLyricsPanelWidth().lyricsPanelWidth.value).toBe(expected)
    expect(storage.get(key)).toBe(saved)
  })

  it('shares previews, commits pixels and persists a return to automatic sizing', async () => {
    const { useLyricsPanelWidth } = await import('./useLyricsPanelWidth')
    const state = useLyricsPanelWidth()
    state.setLyricsPanelWidth(400, false)
    expect(useLyricsPanelWidth().lyricsPanelWidth.value).toBe(400)
    expect(storage.has(key)).toBe(false)
    state.setLyricsPanelWidth(400)
    expect(storage.get(key)).toBe('400')
    vi.resetModules()
    const restored = (await import('./useLyricsPanelWidth')).useLyricsPanelWidth()
    expect(restored.lyricsPanelWidth.value).toBe(400)
    restored.setLyricsPanelWidth(0)
    expect(storage.get(key)).toBe('0')
    vi.resetModules()
    expect(
      (await import('./useLyricsPanelWidth')).useLyricsPanelWidth().lyricsPanelWidth.value,
    ).toBe(0)
  })

  it('clamps only the rendered width when available space shrinks', async () => {
    const { clampLyricsPanelWidth, useLyricsPanelWidth } = await import('./useLyricsPanelWidth')
    const state = useLyricsPanelWidth()
    state.setLyricsPanelWidth(560)
    expect(clampLyricsPanelWidth(state.lyricsPanelWidth.value, 320)).toBe(320)
    expect(state.lyricsPanelWidth.value).toBe(560)
    expect(storage.get(key)).toBe('560')
    expect(clampLyricsPanelWidth(state.lyricsPanelWidth.value, 640)).toBe(560)
  })

  it('keeps the session usable when storage is unavailable', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Storage unavailable')
      },
      setItem: () => {
        throw new Error('Storage unavailable')
      },
    })
    const { useLyricsPanelWidth } = await import('./useLyricsPanelWidth')
    const state = useLyricsPanelWidth()
    expect(state.lyricsPanelWidth.value).toBe(0)
    state.setLyricsPanelWidth(400)
    expect(state.lyricsPanelWidth.value).toBe(400)
    const { rendererDiagnostics } = await import('@renderer/shared/diagnostics/rendererDiagnostics')
    expect(rendererDiagnostics.warn).toHaveBeenCalled()
  })
})
