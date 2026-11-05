import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAlbumColorPreference, setAlbumColorPreference } from './albumColorPreferences'

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
  it('allows an explicit choice to resolve conflicting history without changing other albums', () => {
    const anchors = (ids: number[]) => ids.map((id) => ({ ...first, id }))
    expect(setAlbumColorPreference(anchors([1, 2, 3]), green)).toBe(true)
    expect(setAlbumColorPreference(anchors([3, 4, 5]), green)).toBe(true)
    expect(setAlbumColorPreference(anchors([9]), green)).toBe(true)
    expect(getAlbumColorPreference(anchors([2, 3, 4]))).toBeNull()
    const selected = { r: 18, g: 52, b: 86 }
    expect(setAlbumColorPreference(anchors([2, 3, 4]), selected)).toBe(true)
    expect(getAlbumColorPreference(anchors([2, 3, 4]))).toEqual(selected)
    expect(getAlbumColorPreference(anchors([9]))).toEqual(green)
    expect(setAlbumColorPreference(anchors([2, 3, 4]), null)).toBe(true)
    expect(getAlbumColorPreference(anchors([2, 3, 4]))).toBeNull()
  })
  it('allows an explicit reset of conflicting history', () => {
    const anchors = (ids: number[]) => ids.map((id) => ({ ...first, id }))
    setAlbumColorPreference(anchors([1, 2, 3]), green)
    setAlbumColorPreference(anchors([3, 4, 5]), green)
    expect(setAlbumColorPreference(anchors([2, 3, 4]), null)).toBe(true)
    expect(getAlbumColorPreference(anchors([2, 3, 4]))).toBeNull()
    expect(JSON.parse(storage.get('auralis-album-color-preferences-v1')!).preferences).toEqual([])
  })
  it('reuses parsed storage and reloads externally replaced data', () => {
    const stored = (color: typeof green) =>
      JSON.stringify({
        version: 1,
        preferences: [{ anchors: [first], color }],
        migrated: [],
      })
    storage.set('auralis-album-color-preferences-v1', stored(green))
    const parse = vi.spyOn(JSON, 'parse')
    try {
      expect(getAlbumColorPreference([first])).toEqual(green)
      expect(getAlbumColorPreference([first])).toEqual(green)
      expect(parse).toHaveBeenCalledTimes(1)
      const changed = { r: 1, g: 2, b: 3 }
      storage.set('auralis-album-color-preferences-v1', stored(changed))
      expect(getAlbumColorPreference([first])).toEqual(changed)
      expect(parse).toHaveBeenCalledTimes(2)
    } finally {
      parse.mockRestore()
    }
  })
  it('keeps the saved choice when a replacement write fails and isolates cached values', () => {
    const anchors = [{ ...first }]
    const color = { ...green }
    setAlbumColorPreference(anchors, color)
    anchors[0].id = 99
    color.r = 0
    const read = getAlbumColorPreference([first])!
    read.r = 0
    expect(getAlbumColorPreference([first])).toEqual(green)
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: () => {
        throw new Error('quota')
      },
    })
    expect(setAlbumColorPreference([first], { r: 0, g: 0, b: 0 })).toBe(false)
    expect(getAlbumColorPreference([first])).toEqual(green)
    expect(setAlbumColorPreference([first], null)).toBe(false)
    expect(getAlbumColorPreference([first])).toEqual(green)
  })
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
  it('retains existing preferences and legacy markers when updating old data', () => {
    storage.set(
      'auralis-album-color-preferences-v1',
      JSON.stringify({
        version: 1,
        preferences: [{ anchors: [first], color: green }],
        migrated: ['legacy'],
      }),
    )
    expect(getAlbumColorPreference([first])).toEqual(green)
    expect(setAlbumColorPreference([first], null)).toBe(true)
    expect(getAlbumColorPreference([first])).toBeNull()
    expect(JSON.parse(storage.get('auralis-album-color-preferences-v1')!).migrated).toEqual([
      'legacy',
    ])
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
