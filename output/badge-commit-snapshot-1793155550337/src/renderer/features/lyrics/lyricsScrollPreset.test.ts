import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const storage = new Map<string, string>()
const setItem = vi.fn((key: string, value: string) => storage.set(key, value))

beforeEach(() => {
  storage.clear()
  setItem.mockClear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem,
  })
  vi.resetModules()
})

afterEach(() => vi.unstubAllGlobals())

describe('lyrics scroll preset', () => {
  it('uses standard for missing or invalid stored values and maps all four curves', async () => {
    const state = await import('./lyricsScrollPreset')
    expect(state.getLyricsScrollPreset()).toBe('standard')
    expect(state.LYRICS_SCROLL_PRESETS.map(state.getLyricsScrollEasing)).toEqual([
      'cubic-bezier(0.4, 0, 0.2, 1)',
      'cubic-bezier(0, 0, 0.2, 1)',
      'cubic-bezier(0.2, 0, 0, 1)',
      'cubic-bezier(0.05, 0.7, 0.1, 1)',
    ])

    storage.set(state.LYRICS_SCROLL_PRESET_KEY, 'unknown')
    vi.resetModules()
    expect((await import('./lyricsScrollPreset')).getLyricsScrollPreset()).toBe('standard')
    storage.set(state.LYRICS_SCROLL_PRESET_KEY, 'soft')
    vi.resetModules()
    expect((await import('./lyricsScrollPreset')).getLyricsScrollPreset()).toBe('soft')
  })

  it('applies immediately, reports a failed save and retries the same selection', async () => {
    const state = await import('./lyricsScrollPreset')
    const preference = state.useLyricsScrollPreset()
    setItem.mockImplementationOnce(() => {
      throw new Error('storage unavailable')
    })

    preference.setPreset('quick')
    expect(preference.preset.value).toBe('quick')
    expect(preference.persistFailed.value).toBe(true)
    expect(state.getLyricsScrollEasing()).toBe('cubic-bezier(0, 0, 0.2, 1)')

    preference.setPreset('quick')
    expect(storage.get(state.LYRICS_SCROLL_PRESET_KEY)).toBe('quick')
    expect(preference.persistFailed.value).toBe(false)
  })

  it('updates from storage events in another window and removes the listener on dispose', async () => {
    const listeners = new Set<(event: StorageEvent) => void>()
    vi.stubGlobal('window', {
      addEventListener: (_type: string, listener: (event: StorageEvent) => void) =>
        listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: StorageEvent) => void) =>
        listeners.delete(listener),
    })
    const state = await import('./lyricsScrollPreset')
    const dispose = state.initLyricsScrollPreset()
    storage.set(state.LYRICS_SCROLL_PRESET_KEY, 'emphasized')
    for (const listener of listeners) {
      listener({ key: state.LYRICS_SCROLL_PRESET_KEY } as StorageEvent)
    }
    expect(state.getLyricsScrollPreset()).toBe('emphasized')
    dispose()
    expect(listeners.size).toBe(0)
  })
})
