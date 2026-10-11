import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ALBUM_LIST_PARAMETER_STORAGE_KEY,
  albumListMetadataHeight,
  parseAlbumListParameters,
} from '../constants/albumListParameters'

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: vi.fn() },
}))
let storage: Map<string, string>
beforeEach(() => {
  vi.resetModules()
  storage = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('album list parameter preferences', () => {
  it('accepts valid stored entries and rejects invalid values and future versions', () => {
    const raw = {
      version: 1,
      sizes: { title: 24, artist: 99, year: '12' },
      weights: { title: 600, artist: 900 },
      rounded: false,
      radius: 18,
    }
    expect(parseAlbumListParameters(JSON.stringify(raw))).toEqual({
      sizes: { title: 24 },
      weights: { title: 600 },
      rounded: false,
      radius: 18,
    })
    for (const value of ['broken', 'null', JSON.stringify({ ...raw, version: 2 })]) {
      expect(parseAlbumListParameters(value)).toEqual({
        sizes: {},
        weights: {},
        rounded: true,
        radius: 12,
      })
    }
  })

  it('shares immediate changes and restores radius and font preferences after restarting', async () => {
    const { useAlbumListParameters } = await import('./useAlbumListParameters')
    const first = useAlbumListParameters(),
      second = useAlbumListParameters()
    first.setRadius(20)
    first.setRounded(false)
    first.setSize('title', 24)
    first.setWeight('artist', 600)
    expect(second.preference.value.radius).toBe(20)
    expect(second.preference.value.rounded).toBe(false)
    vi.resetModules()
    const restarted = (await import('./useAlbumListParameters')).useAlbumListParameters()
    restarted.setRounded(true)
    expect(restarted.preference.value.radius).toBe(20)
    expect(restarted.sizes.value.title).toBe(24)
    expect(restarted.preference.value.weights.artist).toBe(600)
  })

  it('resets only album parameters and rejects invalid updates', async () => {
    storage.set('auralis-song-font-sizes', 'song preferences')
    const state = (await import('./useAlbumListParameters')).useAlbumListParameters()
    state.setSize('title', 100)
    state.setRadius(13)
    expect(storage.has(ALBUM_LIST_PARAMETER_STORAGE_KEY)).toBe(false)
    state.setSize('year', 18)
    state.setRadius(24)
    state.setRounded(false)
    state.setWeight('title', 500)
    state.reset()
    expect(parseAlbumListParameters(storage.get(ALBUM_LIST_PARAMETER_STORAGE_KEY)!)).toEqual({
      sizes: {},
      weights: {},
      rounded: true,
      radius: 12,
    })
    expect(storage.get('auralis-song-font-sizes')).toBe('song preferences')
    expect(state.metadataHeight.value).toBe(58)
  })

  it('retains live changes on save failure and clears the failure on retry', async () => {
    const state = (await import('./useAlbumListParameters')).useAlbumListParameters()
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('disk full')
      },
    })
    state.setSize('title', 24)
    expect(state.sizes.value.title).toBe(24)
    expect(state.persistFailed.value).toBe(true)
    vi.stubGlobal('localStorage', { setItem: vi.fn() })
    state.setSize('title', 24)
    expect(state.persistFailed.value).toBe(false)
  })

  it('applies semantic overrides to the root and clears them when defaults are restored', async () => {
    const properties = new Map<string, string>()
    const style = {
      setProperty: (k: string, v: string) => properties.set(k, v),
      removeProperty: (k: string) => properties.delete(k),
    }
    vi.stubGlobal('document', { documentElement: { style } })
    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: (key: string) =>
        ({
          '--album-list-type-title-size': '14px',
          '--album-list-type-artist-size': '12px',
          '--album-list-type-year-size': '11px',
          '--album-list-type-title-weight': '700',
          '--album-list-type-artist-weight': '400',
          '--album-list-type-year-weight': '400',
        })[key] ?? '',
    }))
    const { initAlbumListParameters, useAlbumListParameters } =
      await import('./useAlbumListParameters')
    const stop = initAlbumListParameters(),
      state = useAlbumListParameters()
    try {
      state.setSize('title', 24)
      state.setSize('artist', 20)
      state.setSize('year', 18)
      state.setRounded(false)
      expect(properties.get('--album-list-meta-height')).toBe('84px')
      expect(state.metadataOccupancy.value).toBe(96)
      expect(properties.get('--album-list-cover-radius')).toBe('0px')
      state.reset()
      expect(properties.has('--album-list-type-title-size')).toBe(false)
      expect(properties.get('--album-list-meta-height')).toBe('58px')
      expect(properties.get('--album-list-cover-radius')).toBe('12px')
    } finally {
      stop()
    }
  })

  it('keeps default geometry and grows enough to fit all maximum font sizes', () => {
    expect(albumListMetadataHeight({ title: 14, artist: 12, year: 11 })).toBe(58)
    expect(albumListMetadataHeight({ title: 24, artist: 20, year: 18 })).toBe(84)
  })
})
