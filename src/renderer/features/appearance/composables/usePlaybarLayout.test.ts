import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let storage: Map<string, string>
const key = 'auralis-playbar-layout'

beforeEach(() => {
  vi.resetModules()
  storage = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => storage.get(name) ?? null,
    setItem: (name: string, value: string) => storage.set(name, value),
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('usePlaybarLayout', () => {
  it('defaults to the existing floating island layout', async () => {
    const preference = await import('./usePlaybarLayout')
    expect(preference.PLAYBAR_LAYOUTS).toEqual(['island', 'full'])
    expect(preference.usePlaybarLayout().layout.value).toBe('island')
  })

  it('shares changes, persists the selection and restores it on reload', async () => {
    let preference = await import('./usePlaybarLayout')
    const first = preference.usePlaybarLayout()
    const second = preference.usePlaybarLayout()

    first.setLayout('full')
    expect(second.layout.value).toBe('full')
    expect(storage.get(key)).toBe('full')

    vi.resetModules()
    preference = await import('./usePlaybarLayout')
    expect(preference.usePlaybarLayout().layout.value).toBe('full')
  })

  it.each(['island', 'full', 'invalid', ''])(
    'restores the supported layout or falls back for %s',
    async (value) => {
      storage.set(key, value)
      const preference = await import('./usePlaybarLayout')
      expect(preference.usePlaybarLayout().layout.value).toBe(value === 'full' ? 'full' : 'island')
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
    const preference = await import('./usePlaybarLayout')
    const state = preference.usePlaybarLayout()
    expect(state.layout.value).toBe('island')
    expect(state.persistFailed.value).toBe(false)

    state.setLayout('full')
    expect(state.layout.value).toBe('full')
    expect(state.persistFailed.value).toBe(true)
  })
})
