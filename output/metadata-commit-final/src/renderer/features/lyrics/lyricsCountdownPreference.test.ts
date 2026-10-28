import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const storage = new Map<string, string>()
const setItem = vi.fn((key: string, value: string) => storage.set(key, value))

beforeEach(() => {
  storage.clear()
  setItem.mockClear()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem })
  vi.resetModules()
})
afterEach(() => vi.unstubAllGlobals())

it('defaults to lighting, restores fracture, and rejects unknown saved values', async () => {
  let state = await import('./lyricsCountdownPreference')
  expect(state.useLyricsCountdownPreference().effect.value).toBe('lighting')
  storage.set(state.LYRICS_COUNTDOWN_KEY, 'fracture')
  vi.resetModules()
  state = await import('./lyricsCountdownPreference')
  expect(state.useLyricsCountdownPreference().effect.value).toBe('fracture')
  storage.set(state.LYRICS_COUNTDOWN_KEY, 'unknown')
  vi.resetModules()
  expect(
    (await import('./lyricsCountdownPreference')).useLyricsCountdownPreference().effect.value,
  ).toBe('lighting')
})

it('shares live selection, persists it, and allows retry after storage failure', async () => {
  const state = await import('./lyricsCountdownPreference')
  const first = state.useLyricsCountdownPreference()
  const second = state.useLyricsCountdownPreference()
  setItem.mockImplementationOnce(() => {
    throw new Error('unavailable')
  })
  first.setEffect('fracture')
  expect(second.effect.value).toBe('fracture')
  expect(first.persistFailed.value).toBe(true)
  first.setEffect('fracture')
  expect(storage.get(state.LYRICS_COUNTDOWN_KEY)).toBe('fracture')
  expect(first.persistFailed.value).toBe(false)
})

it('synchronizes external changes and storage clear, then cleans up', async () => {
  const listeners = new Set<(event: StorageEvent) => void>()
  vi.stubGlobal('window', {
    addEventListener: (_: string, cb: (event: StorageEvent) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (event: StorageEvent) => void) => listeners.delete(cb),
  })
  const state = await import('./lyricsCountdownPreference')
  const dispose = state.initLyricsCountdownPreference()
  storage.set(state.LYRICS_COUNTDOWN_KEY, 'fracture')
  listeners.forEach((cb) => cb({ key: state.LYRICS_COUNTDOWN_KEY } as StorageEvent))
  expect(state.useLyricsCountdownPreference().effect.value).toBe('fracture')
  storage.clear()
  listeners.forEach((cb) => cb({ key: null } as StorageEvent))
  expect(state.useLyricsCountdownPreference().effect.value).toBe('lighting')
  dispose()
  expect(listeners.size).toBe(0)
})
