import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SONG_COVER_INFO_LAYOUT,
  SONG_COVER_INFO_LAYOUT_STORAGE_KEY,
  parseSongCoverInfoLayout,
} from '../constants/songCoverInfoLayout'

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))

describe('cover info layout preferences', () => {
  const storage = new Map<string, string>()
  let failRead = false
  let failWrite = false
  beforeEach(() => {
    vi.resetModules()
    storage.clear()
    failRead = false
    failWrite = false
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => {
        if (failRead) throw new Error('Read unavailable')
        return storage.get(key) ?? null
      },
      setItem: (key: string, value: string) => {
        if (failWrite) throw new Error('Write unavailable')
        storage.set(key, value)
      },
    })
  })
  afterEach(() => vi.unstubAllGlobals())
  const load = async () => (await import('./useSongCoverInfoLayout')).useSongCoverInfoLayout()

  it('shares live values, saves them and restores them on reload', async () => {
    const first = await load()
    const second = await load()
    first.setSpacing('artworkGap', 32)
    first.setSpacing('albumArtistGap', 8)
    first.setSpacing('artistDateGap', 13)
    first.setAlignment('center')
    expect(second.preference.value).toEqual({
      artworkGap: 32,
      albumArtistGap: 8,
      artistDateGap: 13,
      alignment: 'center',
    })
    expect(second.style.value['--library-cover-meta-album-artist-gap']).toBe('8px')
    expect(second.style.value['--library-cover-meta-artist-date-gap']).toBe('13px')
    expect(second.style.value['--library-cover-meta-align']).toBe('center')
    vi.resetModules()
    expect((await load()).preference.value).toEqual(first.preference.value)
  })

  it('ignores invalid controls and salvages valid fields from stored data', async () => {
    const state = await load()
    for (const value of [-1, 41, 1.5, NaN, Infinity]) state.setSpacing('artworkGap', value)
    state.setSpacing('albumArtistGap', 21)
    state.setSpacing('artistDateGap', -1)
    state.setAlignment('justify')
    expect(storage.size).toBe(0)
    expect(
      parseSongCoverInfoLayout(
        '{"version":2,"artworkGap":40,"albumArtistGap":21,"artistDateGap":6,"alignment":"right"}',
      ),
    ).toEqual({ artworkGap: 40, albumArtistGap: 0, artistDateGap: 6, alignment: 'right' })
    for (const raw of ['{', 'null', '[]', '{"version":3,"lineGap":8}'])
      expect(parseSongCoverInfoLayout(raw)).toEqual(DEFAULT_SONG_COVER_INFO_LAYOUT)
  })

  it('preserves legacy shared gaps and saves independent values without the old field', async () => {
    storage.set(
      SONG_COVER_INFO_LAYOUT_STORAGE_KEY,
      '{"version":1,"artworkGap":30,"lineGap":8,"alignment":"right"}',
    )
    const state = await load()
    expect(state.preference.value).toEqual({
      artworkGap: 30,
      albumArtistGap: 8,
      artistDateGap: 8,
      alignment: 'right',
    })
    state.setSpacing('artistDateGap', 15)
    const saved = JSON.parse(storage.get(SONG_COVER_INFO_LAYOUT_STORAGE_KEY)!)
    expect(saved).toEqual({ version: 2, ...state.preference.value })
    expect(saved).not.toHaveProperty('lineGap')
    expect(state.preference.value.albumArtistGap).toBe(8)
    expect(parseSongCoverInfoLayout('{"version":1,"lineGap":21}')).toEqual(
      DEFAULT_SONG_COVER_INFO_LAYOUT,
    )
    vi.resetModules()
    expect((await load()).preference.value).toEqual(state.preference.value)
  })

  it('keeps failed writes live, retries unchanged values and reports reset failures', async () => {
    const state = await load()
    failWrite = true
    state.setSpacing('albumArtistGap', 8)
    expect(state.preference.value.albumArtistGap).toBe(8)
    expect(state.persistFailed.value).toBe(true)
    failWrite = false
    state.setSpacing('albumArtistGap', 8)
    expect(state.persistFailed.value).toBe(false)
    expect(JSON.parse(storage.get(SONG_COVER_INFO_LAYOUT_STORAGE_KEY)!).albumArtistGap).toBe(8)
    failWrite = true
    state.reset()
    expect(state.preference.value).toEqual(DEFAULT_SONG_COVER_INFO_LAYOUT)
    expect(state.persistFailed.value).toBe(true)
  })

  it('resets layout without altering font or other existing preferences', async () => {
    storage.set('auralis-song-font-sizes', '{"version":1,"list":{"title":18},"cover":{"album":20}}')
    storage.set('auralis-cover-artwork-radius', '18')
    const state = await load()
    state.setSpacing('albumArtistGap', 7)
    state.setSpacing('artistDateGap', 12)
    state.setAlignment('right')
    state.reset()
    expect(state.preference.value).toEqual(DEFAULT_SONG_COVER_INFO_LAYOUT)
    expect(storage.get('auralis-cover-artwork-radius')).toBe('18')
    expect(JSON.parse(storage.get('auralis-song-font-sizes')!).list.title).toBe(18)
  })

  it('grows metadata line heights with fonts while unsupported surfaces retain defaults', async () => {
    const state = await load()
    const { useSongFontSizes } = await import('./useSongFontSizes')
    useSongFontSizes().setSongFontSize('cover', 'album', 20)
    useSongFontSizes().setSongFontSize('cover', 'albumArtist', 18)
    state.setSpacing('albumArtistGap', 8)
    state.setSpacing('artistDateGap', 12)
    expect(state.metadataLayout.value).toMatchObject({
      albumLineHeight: 25,
      artistLineHeight: 23,
      dateLineHeight: 20,
      albumArtistGap: 8,
      artistDateGap: 12,
    })
    const { useSongCoverInfoLayout } = await import('./useSongCoverInfoLayout')
    expect(useSongCoverInfoLayout(false).metadataLayout.value).toMatchObject({
      albumLineHeight: 20,
      artistLineHeight: 20,
      albumArtistGap: 0,
      artistDateGap: 0,
      artworkGap: 12,
    })
    expect(useSongCoverInfoLayout(false).style.value['--library-cover-meta-align']).toBe('left')
  })

  it('falls back safely when storage reads fail', async () => {
    failRead = true
    expect((await load()).preference.value).toEqual(DEFAULT_SONG_COVER_INFO_LAYOUT)
  })
})
