import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAlbumColorPreference,
  migrateAlbumColorPreference,
  setAlbumColorPreference,
} from './albumColorPreferences'

const first = { id: 1, createdAt: '2024-01-01' }
const second = { id: 2, createdAt: '2024-01-02' }
const green = { r: 207, g: 255, b: 196 }
let storage: Map<string, string>
beforeEach(() => {
  storage = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('album color preferences', () => {
  it('retains a choice for the same tracks when cover and metadata change', () => {
    expect(setAlbumColorPreference([first, second], green)).toBe(true)
    expect(getAlbumColorPreference([second, first])).toEqual(green)
    expect(getAlbumColorPreference([{ ...first, createdAt: '2025-01-01' }])).toBeNull()
    expect(getAlbumColorPreference([{ id: 7, createdAt: first.createdAt }])).toBeNull()
  })
  it('reloads a saved choice from storage in a fresh module session', async () => {
    expect(setAlbumColorPreference([first, second], green)).toBe(true)
    vi.resetModules()
    const fresh = await import('./albumColorPreferences')
    expect(fresh.getAlbumColorPreference([first, second])).toEqual(green)
  })
  it('migrates once, and does not restore a removed legacy preference', () => {
    expect(migrateAlbumColorPreference([first], 'legacy', green)).toBe(true)
    expect(getAlbumColorPreference([first])).toEqual(green)
    expect(setAlbumColorPreference([first], null)).toBe(true)
    expect(migrateAlbumColorPreference([first], 'legacy', green)).toBe(true)
    expect(getAlbumColorPreference([first])).toBeNull()
  })
  it('does not carry a preference into an ambiguous evenly split album', () => {
    expect(setAlbumColorPreference([first, second], green)).toBe(true)
    expect(getAlbumColorPreference([first])).toBeNull()
    expect(getAlbumColorPreference([second])).toBeNull()
  })
  it('refuses to overwrite corrupt data or a failed storage write', () => {
    storage.set('auralis-album-color-preferences-v1', '{bad')
    expect(setAlbumColorPreference([first], green)).toBe(false)
    expect(storage.get('auralis-album-color-preferences-v1')).toBe('{bad')
    storage.clear()
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
    })
    expect(setAlbumColorPreference([first], green)).toBe(false)
  })
})
