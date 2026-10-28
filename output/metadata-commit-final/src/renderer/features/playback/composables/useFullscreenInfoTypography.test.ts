import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FULLSCREEN_INFO_TYPOGRAPHY_STORAGE_KEY } from '../constants/fullscreenInfoTypography'

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))

describe('useFullscreenInfoTypography', () => {
  const storage = new Map<string, string>()
  let readError = false
  let writeError = false
  let writes = 0

  beforeEach(async () => {
    storage.clear()
    readError = false
    writeError = false
    writes = 0
    vi.resetModules()
    const { rendererDiagnostics } = await import('@renderer/shared/diagnostics/rendererDiagnostics')
    vi.mocked(rendererDiagnostics.warn).mockClear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => {
        if (readError) throw new Error('read failed')
        return storage.get(key) ?? null
      },
      setItem: (key: string, value: string) => {
        writes++
        if (writeError) throw new Error('write failed')
        storage.set(key, value)
      },
    })
  })

  async function load() {
    const diagnostics = await import('@renderer/shared/diagnostics/rendererDiagnostics')
    const api = await import('./useFullscreenInfoTypography')
    return { warn: diagnostics.rendererDiagnostics.warn, ...api.useFullscreenInfoTypography() }
  }

  function stored(): unknown {
    return JSON.parse(storage.get(FULLSCREEN_INFO_TYPOGRAPHY_STORAGE_KEY) ?? '')
  }

  it('shares one preference and persists a single field without resetting the other line', async () => {
    const first = await load()
    const second = (await import('./useFullscreenInfoTypography')).useFullscreenInfoTypography()

    expect(first.preference.value).toEqual({
      titleFontSizePx: 25,
      titleFontWeight: 800,
      subtitleFontSizePx: 19,
      subtitleFontWeight: 700,
    })
    expect(storage.has(FULLSCREEN_INFO_TYPOGRAPHY_STORAGE_KEY)).toBe(false)

    first.setPreference({ subtitleFontSizePx: 24 })
    expect(second.preference.value.subtitleFontSizePx).toBe(24)
    expect(second.preference.value.titleFontWeight).toBe(800)
    expect(stored()).toEqual({
      version: 1,
      titleFontSizePx: 25,
      titleFontWeight: 800,
      subtitleFontSizePx: 24,
      subtitleFontWeight: 700,
    })
  })

  it('preserves legal fields from storage and restores them after module reload', async () => {
    storage.set(
      FULLSCREEN_INFO_TYPOGRAPHY_STORAGE_KEY,
      JSON.stringify({ version: 1, titleFontWeight: 600, subtitleFontSizePx: 16 }),
    )
    const state = await load()
    expect(state.preference.value).toEqual({
      titleFontSizePx: 25,
      titleFontWeight: 600,
      subtitleFontSizePx: 16,
      subtitleFontWeight: 700,
    })

    vi.resetModules()
    const restored = await load()
    expect(restored.preference.value).toEqual(state.preference.value)
  })

  it('resets both lines in one save, including when already at defaults', async () => {
    const state = await load()
    state.setPreference({ titleFontSizePx: 32, subtitleFontWeight: 500 })
    writes = 0
    state.resetPreference()

    expect(writes).toBe(1)
    expect(state.preference.value).toEqual({
      titleFontSizePx: 25,
      titleFontWeight: 800,
      subtitleFontSizePx: 19,
      subtitleFontWeight: 700,
    })
    expect(stored()).toEqual({
      version: 1,
      titleFontSizePx: 25,
      titleFontWeight: 800,
      subtitleFontSizePx: 19,
      subtitleFontWeight: 700,
    })
    writes = 0
    state.resetPreference()
    expect(writes).toBe(1)
  })

  it('keeps an applied value on save failure and allows same-value retry', async () => {
    const state = await load()
    writeError = true
    state.setPreference({ titleFontWeight: 500 })
    expect(state.preference.value.titleFontWeight).toBe(500)
    expect(state.style.value['--fullscreen-info-title-font-weight']).toBe('500')
    expect(state.style.value['--fullscreen-info-subtitle-font-weight']).toBe('700')
    expect(state.persistFailed.value).toBe(true)
    expect(state.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'playback.fullscreen-info-typography',
        message:
          'Could not save fullscreen info typography preference; keeping it for this session',
      }),
    )

    writeError = false
    state.setPreference({ titleFontWeight: 500 })
    expect(state.persistFailed.value).toBe(false)
    expect(stored()).toEqual({
      version: 1,
      titleFontSizePx: 25,
      titleFontWeight: 500,
      subtitleFontSizePx: 19,
      subtitleFontWeight: 700,
    })
  })

  it('keeps defaults when storage read throws and rejects invalid updates', async () => {
    readError = true
    const state = await load()
    expect(state.preference.value.titleFontSizePx).toBe(25)
    expect(state.persistFailed.value).toBe(false)
    state.setPreference({ subtitleFontSizePx: 33, titleFontWeight: 400 })
    expect(state.preference.value.subtitleFontSizePx).toBe(19)
    expect(state.preference.value.titleFontWeight).toBe(400)
    expect(stored()).toEqual({
      version: 1,
      titleFontSizePx: 25,
      titleFontWeight: 400,
      subtitleFontSizePx: 19,
      subtitleFontWeight: 700,
    })
    expect(state.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Could not read fullscreen info typography preference',
      }),
    )
  })
})
