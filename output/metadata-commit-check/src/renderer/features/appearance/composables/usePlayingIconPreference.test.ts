import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let storage: Map<string, string>
const key = 'auralis-playing-icon-preset'
beforeEach(() => {
  vi.resetModules()
  storage = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => storage.get(name) ?? null,
    setItem: (name: string, value: string) => storage.set(name, value),
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('usePlayingIconPreference', () => {
  it('offers only implemented icons and defaults to the existing equalizer', async () => {
    const preference = await import('./usePlayingIconPreference')
    expect(preference.PLAYING_ICON_PRESETS).toEqual(['equalizer', 'blocks-wave'])
    expect(preference.getPlayingIconPreset()).toBe('equalizer')
  })

  it('updates shared consumers, persists selection and restores it on reload', async () => {
    let preference = await import('./usePlayingIconPreference')
    const first = preference.usePlayingIconPreference()
    const second = preference.usePlayingIconPreference()
    first.setPlayingIcon('blocks-wave')
    expect(second.playingIcon.value).toBe('blocks-wave')
    expect(storage.get(key)).toBe('blocks-wave')
    vi.resetModules()
    preference = await import('./usePlayingIconPreference')
    expect(preference.getPlayingIconPreset()).toBe('blocks-wave')
  })

  it.each(['note', 'pause', 'wave', 'invalid'])(
    'falls back for the obsolete or invalid value %s',
    async (value) => {
      storage.set(key, value)
      const preference = await import('./usePlayingIconPreference')
      expect(preference.getPlayingIconPreset()).toBe('equalizer')
      expect(storage.get(key)).toBe(value)
    },
  )

  it('still applies the choice if storage is unavailable', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Storage unavailable')
      },
      setItem: () => {
        throw new Error('Storage unavailable')
      },
    })
    const preference = await import('./usePlayingIconPreference')
    expect(preference.getPlayingIconPreset()).toBe('equalizer')
    preference.setPlayingIconPreset('blocks-wave')
    expect(preference.getPlayingIconPreset()).toBe('blocks-wave')
  })
})
