import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let storage: Map<string, string>
const key = 'auralis-playbar-style'

beforeEach(() => {
  vi.resetModules()
  storage = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => storage.get(name) ?? null,
    setItem: (name: string, value: string) => storage.set(name, value),
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('usePlaybarStyle', () => {
  it('defaults to the plain surface and offers only plain and frosted styles', async () => {
    const preference = await import('./usePlaybarStyle')
    expect(preference.PLAYBAR_STYLES).toEqual(['plain', 'frosted'])
    expect(preference.usePlaybarStyle().style.value).toBe('plain')
  })

  it('shares the frosted selection, persists it and restores it on reload', async () => {
    let preference = await import('./usePlaybarStyle')
    const first = preference.usePlaybarStyle()
    const second = preference.usePlaybarStyle()

    first.setStyle('frosted')
    expect(second.style.value).toBe('frosted')
    expect(storage.get(key)).toBe('frosted')

    vi.resetModules()
    preference = await import('./usePlaybarStyle')
    expect(preference.usePlaybarStyle().style.value).toBe('frosted')
  })

  it.each(['plain', 'frosted', 'liquid', 'invalid', ''])(
    'restores a supported style or falls back for %s',
    async (value) => {
      storage.set(key, value)
      const preference = await import('./usePlaybarStyle')
      expect(preference.usePlaybarStyle().style.value).toBe(value === 'frosted' ? value : 'plain')
    },
  )
})
