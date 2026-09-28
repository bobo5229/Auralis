import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SONG_FONT_WEIGHT_STORAGE_KEY } from '../constants/songFontWeights'

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))

describe('useSongFontWeights', () => {
  const storage = new Map<string, string>()
  let readError = false
  let writeError = false

  beforeEach(async () => {
    storage.clear()
    readError = false
    writeError = false
    vi.resetModules()
    const { rendererDiagnostics } = await import('@renderer/shared/diagnostics/rendererDiagnostics')
    vi.mocked(rendererDiagnostics.warn).mockClear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => {
        if (readError) throw new Error('read failed')
        return storage.get(key) ?? null
      },
      setItem: (key: string, value: string) => {
        if (writeError) throw new Error('write failed')
        storage.set(key, value)
      },
    })
  })

  async function load() {
    const diagnostics = await import('@renderer/shared/diagnostics/rendererDiagnostics')
    const api = await import('./useSongFontWeights')
    return {
      warn: diagnostics.rendererDiagnostics.warn,
      ...api.useSongFontWeights(),
    }
  }

  function stored(): {
    version: number
    list: Record<string, number>
    cover: Record<string, number>
  } {
    return JSON.parse(storage.get(SONG_FONT_WEIGHT_STORAGE_KEY) ?? '')
  }

  it('starts from defaults and shares one preference', async () => {
    const first = await load()
    const second = (await import('./useSongFontWeights')).useSongFontWeights()

    expect(first.preference.value).toEqual({ list: {}, cover: {} })
    expect(first.songFontWeightStyle.value['--auralis-song-list-title-weight']).toBe('700')
    expect(storage.has(SONG_FONT_WEIGHT_STORAGE_KEY)).toBe(false)

    first.setSongFontWeight('list', 'title', 600)
    expect(second.preference.value.list.title).toBe(600)
    expect(stored()).toEqual({ version: 1, list: { title: 600 }, cover: {} })
  })

  it('restores one field to the default without touching the other view', async () => {
    const state = await load()
    state.setSongFontWeight('list', 'title', 600)
    state.setSongFontWeight('list', 'artist', 500)
    state.setSongFontWeight('cover', 'title', 700)
    state.setSongFontWeight('list', 'title', 'default')

    expect(state.songFontWeightChoice('list', 'title')).toBe('default')
    expect(state.songFontWeightStyle.value['--auralis-song-list-title-weight']).toBe('700')
    expect(stored()).toEqual({
      version: 1,
      list: { artist: 500 },
      cover: { title: 700 },
    })
  })

  it('resets only the current view', async () => {
    const state = await load()
    state.setSongFontWeight('list', 'album', 500)
    state.setSongFontWeight('cover', 'duration', 600)
    state.resetSongFontWeightView('cover')

    expect(stored()).toEqual({
      version: 1,
      list: { album: 500 },
      cover: {},
    })
    expect(state.songFontWeightStyle.value['--auralis-song-cover-duration-weight']).toBe('400')
  })

  it('keeps illegal storage until the next valid edit', async () => {
    const raw = JSON.stringify({
      version: 1,
      list: { title: 650, artist: 500 },
      cover: { missing: 700 },
    })
    storage.set(SONG_FONT_WEIGHT_STORAGE_KEY, raw)
    const state = await load()

    expect(state.preference.value).toEqual({ list: { artist: 500 }, cover: {} })
    expect(storage.get(SONG_FONT_WEIGHT_STORAGE_KEY)).toBe(raw)
    expect(state.warn).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Ignored invalid song font weight entries' }),
    )

    state.setSongFontWeight('cover', 'title', 700)
    expect(stored()).toEqual({
      version: 1,
      list: { artist: 500 },
      cover: { title: 700 },
    })
  })

  it('keeps damaged or unsupported storage until the next valid edit', async () => {
    storage.set(SONG_FONT_WEIGHT_STORAGE_KEY, '{')
    const damaged = await load()
    expect(damaged.preference.value).toEqual({ list: {}, cover: {} })
    expect(storage.get(SONG_FONT_WEIGHT_STORAGE_KEY)).toBe('{')
    expect(damaged.warn).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Ignored unusable song font weight preference' }),
    )

    damaged.resetSongFontWeightView('list')
    expect(stored()).toEqual({ version: 1, list: {}, cover: {} })

    vi.resetModules()
    storage.set(
      SONG_FONT_WEIGHT_STORAGE_KEY,
      JSON.stringify({ version: 2, list: { title: 600 }, cover: {} }),
    )
    const unsupported = await load()
    expect(unsupported.preference.value.list).toEqual({})
    expect(storage.get(SONG_FONT_WEIGHT_STORAGE_KEY)).toContain('"version":2')
  })

  it('reports storage failures and clears the warning after a later save', async () => {
    readError = true
    const unreadable = await load()
    expect(unreadable.preference.value).toEqual({ list: {}, cover: {} })
    expect(unreadable.persistFailed.value).toBe(false)
    expect(unreadable.warn).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Could not read song font weight preference' }),
    )

    vi.resetModules()
    readError = false
    writeError = true
    const state = await load()
    state.setSongFontWeight('list', 'duration', 700)
    expect(state.preference.value.list.duration).toBe(700)
    expect(state.persistFailed.value).toBe(true)
    expect(state.songFontWeightStyle.value['--auralis-song-list-duration-weight']).toBe('700')
    expect(storage.has(SONG_FONT_WEIGHT_STORAGE_KEY)).toBe(false)
    expect(state.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Could not save song font weight preference; keeping it for this session',
      }),
    )

    writeError = false
    state.setSongFontWeight('cover', 'genre', 600)
    expect(state.persistFailed.value).toBe(false)
    expect(stored().list.duration).toBe(700)
    expect(stored().cover.genre).toBe(600)
  })

  it('ignores a field that does not belong to the view', async () => {
    const state = await load()
    state.setSongFontWeight('list', 'discHeading', 700)
    expect(state.preference.value).toEqual({ list: {}, cover: {} })
    expect(storage.has(SONG_FONT_WEIGHT_STORAGE_KEY)).toBe(false)
    expect(state.warn).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Ignored song font weight update for an unknown field' }),
    )
  })
})
