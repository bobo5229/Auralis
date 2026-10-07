import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))

describe('Chinese text preferences', () => {
  const storage = new Map<string, string>()
  let writeFails = false
  let readFails = false
  beforeEach(() => {
    vi.resetModules()
    storage.clear()
    writeFails = readFails = false
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => {
        if (readFails) throw new Error('Read unavailable')
        return storage.get(key) ?? null
      },
      setItem: (key: string, value: string) => {
        if (writeFails) throw new Error('Write unavailable')
        storage.set(key, value)
      },
    })
  })
  afterEach(() => vi.unstubAllGlobals())
  const load = async () => (await import('./useChineseTextDisplay')).useChineseTextDisplay()

  it('defaults to simplified and shares independent live preferences across consumers', async () => {
    const first = await load(),
      second = await load()
    expect(first.songInfoScript.value).toBe('simplified')
    expect(first.lyricsScript.value).toBe('simplified')
    first.setSongInfoScript('traditional')
    expect(second.songText('看着你')).toBe('看著你')
    expect(second.lyricText('看著你')).toBe('看着你')
    first.setLyricsScript('traditional')
    first.setSongInfoScript('simplified')
    expect(second.songText('看著你')).toBe('看着你')
    expect(second.lyricText('看着你')).toBe('看著你')
    vi.resetModules()
    const restored = await load()
    expect(restored.songInfoScript.value).toBe('simplified')
    expect(restored.lyricsScript.value).toBe('traditional')
    expect(storage.size).toBe(2)
  })
  it('splits multi-value metadata before display and preserves slash compounds', async () => {
    const state = await load()
    state.setSongInfoScript('traditional')
    expect(state.songValues('萧敬腾; 郁可唯; AC/DC')).toBe('蕭敬騰, 鬱可唯 & AC/DC')
    expect(state.songValues('流行; 节奏布鲁斯/R&B')).toBe('流行 & 節奏布魯斯/R&B')
    expect(state.songParts(['头发', '出发'])).toBe('頭髮 & 出發')
  })
  it('falls back for invalid storage and read failure without overwriting storage', async () => {
    storage.set('auralis-song-info-script', 'corrupt')
    storage.set('auralis-lyrics-script', 'traditional')
    const state = await load()
    expect(state.songInfoScript.value).toBe('simplified')
    expect(state.lyricsScript.value).toBe('traditional')
    expect(storage.get('auralis-song-info-script')).toBe('corrupt')
    readFails = true
    vi.resetModules()
    const failed = await load()
    expect(failed.songInfoScript.value).toBe('simplified')
    expect(failed.lyricsScript.value).toBe('simplified')
  })
  it('keeps failed saves live, isolates errors and retries the same selection', async () => {
    const state = await load()
    writeFails = true
    state.setSongInfoScript('traditional')
    expect(state.songText('头发')).toBe('頭髮')
    expect(state.songInfoPersistFailed.value).toBe(true)
    expect(state.lyricsPersistFailed.value).toBe(false)
    writeFails = false
    state.setSongInfoScript('traditional')
    expect(state.songInfoPersistFailed.value).toBe(false)
    expect(storage.get('auralis-song-info-script')).toBe('traditional')
  })
})
