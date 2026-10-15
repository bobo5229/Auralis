import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const storage = new Map<string, string>()
const setItem = vi.fn((key: string, value: string) => storage.set(key, value))

beforeEach(() => {
  storage.clear()
  setItem.mockReset()
  setItem.mockImplementation((key, value) => storage.set(key, value))
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem,
  })
  vi.resetModules()
})

afterEach(() => vi.unstubAllGlobals())

it('defaults to split and restores only supported stored modes', async () => {
  let state = await import('./useLyricsPanelMode')
  expect(state.useLyricsPanelMode().mode.value).toBe('split')
  storage.set(state.LYRICS_PANEL_MODE_KEY, 'floating')
  vi.resetModules()
  state = await import('./useLyricsPanelMode')
  expect(state.useLyricsPanelMode().mode.value).toBe('floating')
  storage.set(state.LYRICS_PANEL_MODE_KEY, 'unknown')
  vi.resetModules()
  state = await import('./useLyricsPanelMode')
  expect(state.useLyricsPanelMode().mode.value).toBe('split')
})

it('shares live changes, keeps the expansion preference intact, and retries failed saves', async () => {
  const state = await import('./useLyricsPanelMode')
  const settings = state.useLyricsPanelMode()
  const shell = state.useLyricsPanelMode()
  storage.set('auralis-lyrics-panel-expanded', 'false')
  setItem.mockImplementationOnce(() => {
    throw new Error('storage unavailable')
  })
  settings.setMode('floating')
  expect(shell.mode.value).toBe('floating')
  expect(settings.persistFailed.value).toBe(true)
  settings.setMode('floating')
  expect(settings.persistFailed.value).toBe(false)
  expect(storage.get(state.LYRICS_PANEL_MODE_KEY)).toBe('floating')
  expect(storage.get('auralis-lyrics-panel-expanded')).toBe('false')
})

it('falls back to split when storage cannot be read', async () => {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('storage unavailable')
    },
  })
  expect((await import('./useLyricsPanelMode')).useLyricsPanelMode().mode.value).toBe('split')
})

it('synchronizes storage changes and clear events and removes its listener', async () => {
  const listeners = new Set<(event: StorageEvent) => void>()
  vi.stubGlobal('window', {
    addEventListener: (_: string, cb: (event: StorageEvent) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (event: StorageEvent) => void) => listeners.delete(cb),
  })
  const state = await import('./useLyricsPanelMode')
  const dispose = state.initLyricsPanelMode()
  storage.set(state.LYRICS_PANEL_MODE_KEY, 'floating')
  listeners.forEach((cb) => cb({ key: 'unrelated' } as StorageEvent))
  expect(state.useLyricsPanelMode().mode.value).toBe('split')
  listeners.forEach((cb) => cb({ key: state.LYRICS_PANEL_MODE_KEY } as StorageEvent))
  expect(state.useLyricsPanelMode().mode.value).toBe('floating')
  storage.clear()
  listeners.forEach((cb) => cb({ key: null } as StorageEvent))
  expect(state.useLyricsPanelMode().mode.value).toBe('split')
  dispose()
  expect(listeners.size).toBe(0)
})
