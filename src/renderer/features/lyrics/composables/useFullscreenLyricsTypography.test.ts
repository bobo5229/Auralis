import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FULLSCREEN_LYRICS_TYPOGRAPHY_STORAGE_KEY } from '../constants/fullscreenLyricsTypography'

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))

describe('useFullscreenLyricsTypography', () => {
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
    const api = await import('./useFullscreenLyricsTypography')
    return { warn: diagnostics.rendererDiagnostics.warn, ...api.useFullscreenLyricsTypography() }
  }

  function stored(): unknown {
    return JSON.parse(storage.get(FULLSCREEN_LYRICS_TYPOGRAPHY_STORAGE_KEY) ?? '')
  }

  it('shares one preference and persists complete updates for both consumers', async () => {
    const first = await load()
    const second = (await import('./useFullscreenLyricsTypography')).useFullscreenLyricsTypography()

    expect(first.preference.value).toEqual({
      fontSizePercent: 100,
      fontWeight: 800,
      lineGapPercent: 100,
    })
    expect(storage.has(FULLSCREEN_LYRICS_TYPOGRAPHY_STORAGE_KEY)).toBe(false)

    first.setPreference({ fontSizePercent: 125 })
    expect(second.preference.value.fontSizePercent).toBe(125)
    expect(stored()).toEqual({
      version: 1,
      fontSizePercent: 125,
      fontWeight: 800,
      lineGapPercent: 100,
    })
  })

  it('preserves legal fields from storage and restores them after module reload', async () => {
    storage.set(
      FULLSCREEN_LYRICS_TYPOGRAPHY_STORAGE_KEY,
      JSON.stringify({ version: 1, fontSizePercent: 130, fontWeight: 600 }),
    )
    const state = await load()
    expect(state.preference.value).toEqual({
      fontSizePercent: 130,
      fontWeight: 600,
      lineGapPercent: 100,
    })

    vi.resetModules()
    const restored = await load()
    expect(restored.preference.value).toEqual(state.preference.value)
  })

  it('resets all lyric fields in one save, including when already at defaults', async () => {
    const state = await load()
    state.setPreference({ fontSizePercent: 125, fontWeight: 600, lineGapPercent: 80 })
    writes = 0
    state.resetPreference()

    expect(writes).toBe(1)
    expect(state.preference.value).toEqual({
      fontSizePercent: 100,
      fontWeight: 800,
      lineGapPercent: 100,
    })
    expect(stored()).toEqual({
      version: 1,
      fontSizePercent: 100,
      fontWeight: 800,
      lineGapPercent: 100,
    })
    writes = 0
    state.resetPreference()
    expect(writes).toBe(1)
  })

  it('keeps an applied value on save failure and allows same-value retry', async () => {
    const state = await load()
    writeError = true
    state.setPreference({ fontWeight: 600 })
    expect(state.preference.value.fontWeight).toBe(600)
    expect(state.style.value['--fullscreen-lyrics-font-weight']).toBe('600')
    expect(state.persistFailed.value).toBe(true)
    expect(state.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'lyrics.fullscreen-typography',
        message:
          'Could not save fullscreen lyrics typography preference; keeping it for this session',
      }),
    )

    writeError = false
    state.setPreference({ fontWeight: 600 })
    expect(state.persistFailed.value).toBe(false)
    expect(stored()).toEqual({
      version: 1,
      fontSizePercent: 100,
      fontWeight: 600,
      lineGapPercent: 100,
    })
  })

  it('keeps defaults when storage read throws and rejects invalid updates', async () => {
    readError = true
    const state = await load()
    expect(state.preference.value.fontSizePercent).toBe(100)
    expect(state.persistFailed.value).toBe(false)
    state.setPreference({ fontSizePercent: 126 })
    expect(state.preference.value.fontSizePercent).toBe(100)
    expect(storage.has(FULLSCREEN_LYRICS_TYPOGRAPHY_STORAGE_KEY)).toBe(false)
    expect(state.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Could not read fullscreen lyrics typography preference',
      }),
    )
  })
})
