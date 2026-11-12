import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let storage: Map<string, string>
const key = 'auralis-island-playbar-material'

beforeEach(() => {
  vi.resetModules()
  storage = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => storage.get(name) ?? null,
    setItem: (name: string, value: string) => storage.set(name, value),
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('useIslandPlaybarMaterial', () => {
  it('defaults to the existing floating island layout', async () => {
    const preference = await import('./useIslandPlaybarMaterial')
    expect(preference.ISLAND_PLAYBAR_MATERIALS).toEqual(['frosted', 'liquid'])
    expect(preference.useIslandPlaybarMaterial().material.value).toBe('frosted')
  })

  it('shares changes, persists the selection and restores it on reload', async () => {
    let preference = await import('./useIslandPlaybarMaterial')
    const first = preference.useIslandPlaybarMaterial()
    const second = preference.useIslandPlaybarMaterial()

    first.setMaterial('liquid')
    expect(second.material.value).toBe('liquid')
    expect(storage.get(key)).toBe('liquid')

    vi.resetModules()
    preference = await import('./useIslandPlaybarMaterial')
    expect(preference.useIslandPlaybarMaterial().material.value).toBe('liquid')
  })

  it.each(['frosted', 'liquid', 'invalid', ''])(
    'restores the supported layout or falls back for %s',
    async (value) => {
      storage.set(key, value)
      const preference = await import('./useIslandPlaybarMaterial')
      expect(preference.useIslandPlaybarMaterial().material.value).toBe(value === 'liquid' ? 'liquid' : 'frosted')
    },
  )

  it('keeps the chosen layout when storage is unavailable and reports the failure', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Storage unavailable')
      },
      setItem: () => {
        throw new Error('Storage unavailable')
      },
    })
    const preference = await import('./useIslandPlaybarMaterial')
    const state = preference.useIslandPlaybarMaterial()
    expect(state.material.value).toBe('frosted')
    expect(state.persistFailed.value).toBe(false)

    state.setMaterial('liquid')
    expect(state.material.value).toBe('liquid')
    expect(state.persistFailed.value).toBe(true)
  })
})
