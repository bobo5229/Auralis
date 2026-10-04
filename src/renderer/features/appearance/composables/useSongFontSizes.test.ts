import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SONG_FONT_SIZE_STORAGE_KEY, parseStoredSongFontSizes } from '../constants/songFontSizes'
import { SONG_FONT_WEIGHT_STORAGE_KEY } from '../constants/songFontWeights'

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))

describe('song font size preferences', () => {
  const storage = new Map<string, string>()
  let writeFails = false
  beforeEach(() => {
    vi.resetModules()
    storage.clear()
    writeFails = false
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (writeFails) throw new Error('Storage unavailable')
        storage.set(key, value)
      },
    })
  })
  afterEach(() => vi.unstubAllGlobals())
  const load = async () => (await import('./useSongFontSizes')).useSongFontSizes()

  it('preserves existing weights, shares live sizes, and restores them after remount', async () => {
    storage.set(SONG_FONT_WEIGHT_STORAGE_KEY, 'existing weights')
    const first = await load()
    const second = await load()
    expect(first.songFontSize('list', 'title')).toBe(14)
    expect(first.songFontSize('list', 'duration')).toBe(12)
    expect(first.songFontSize('cover', 'album')).toBe(16)
    first.setSongFontSize('list', 'title', 15)
    first.setSongFontSize('cover', 'title', 17)
    expect(second.songFontSizeStyle.value['--auralis-song-list-title-size']).toBe('15px')
    expect(second.songFontSizeStyle.value['--auralis-song-cover-title-size']).toBe('17px')
    expect(storage.get(SONG_FONT_WEIGHT_STORAGE_KEY)).toBe('existing weights')
    vi.resetModules()
    const restored = await load()
    expect(restored.songFontSize('list', 'title')).toBe(15)
    expect(restored.songFontSize('cover', 'title')).toBe(17)
  })

  it('resets just the current view and restores defaults', async () => {
    const state = await load()
    state.setSongFontSize('list', 'album', 13)
    state.setSongFontSize('cover', 'album', 18)
    state.resetSongFontSizeView('cover')
    expect(state.songFontSize('cover', 'album')).toBe(16)
    expect(state.songFontSize('list', 'album')).toBe(13)
    state.setSongFontSize('list', 'album', 12)
    expect(JSON.parse(storage.get(SONG_FONT_SIZE_STORAGE_KEY)!)).toEqual({
      version: 1,
      list: {},
      cover: {},
    })
  })

  it('rejects invalid sizes and fields without writing storage', async () => {
    const state = await load()
    for (const size of [9, 25, 14.5, NaN, Infinity]) state.setSongFontSize('list', 'title', size)
    state.setSongFontSize('list', 'releaseDate', 12)
    state.setSongFontSize('cover', 'artist', 19)
    state.setSongFontSize('cover', 'title', 21)
    expect(storage.has(SONG_FONT_SIZE_STORAGE_KEY)).toBe(false)
    expect(state.songFontSize('list', 'title')).toBe(14)
  })

  it('keeps changes live on save failure and retries the same value', async () => {
    const state = await load()
    writeFails = true
    state.setSongFontSize('list', 'title', 15)
    expect(state.songFontSize('list', 'title')).toBe(15)
    expect(state.persistFailed.value).toBe(true)
    writeFails = false
    state.setSongFontSize('list', 'title', 15)
    expect(state.persistFailed.value).toBe(false)
    expect(JSON.parse(storage.get(SONG_FONT_SIZE_STORAGE_KEY)!).list.title).toBe(15)
  })

  it('restores valid entries and ignores corrupt, unsupported or out-of-bounds storage', () => {
    expect(
      parseStoredSongFontSizes(
        JSON.stringify({
          version: 1,
          list: { title: 15, duration: 40, bad: 12 },
          cover: { artist: 19, discHeading: 9 },
        }),
      ),
    ).toEqual({ list: { title: 15 }, cover: { discHeading: 9 } })
    for (const raw of ['{', 'null', '[]', '{"version":2,"list":{"title":15}}']) {
      expect(parseStoredSongFontSizes(raw)).toEqual({ list: {}, cover: {} })
    }
  })
})
