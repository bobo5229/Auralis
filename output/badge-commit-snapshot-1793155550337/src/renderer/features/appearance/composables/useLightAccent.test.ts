import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LIGHT_ACCENT } from '../constants/lightAccent'

interface StorageOptions {
  failReads?: boolean
  failWrites?: boolean
}

type TestStorage = Storage & {
  values: Map<string, string>
  options: StorageOptions
  writes: string[]
}

function createStorage(
  initial: Record<string, string> = {},
  options: StorageOptions = {},
): TestStorage {
  const values = new Map(Object.entries(initial))
  const storage: TestStorage = {
    values,
    options,
    writes: [],
    getItem(key) {
      if (options.failReads) throw new Error('read blocked')
      return values.get(key) ?? null
    },
    setItem(key, value) {
      this.writes.push(key)
      if (options.failWrites) throw new Error('write blocked')
      values.set(key, String(value))
    },
    removeItem(key) {
      values.delete(key)
    },
    clear() {
      values.clear()
    },
    key(index) {
      return [...values.keys()][index] ?? null
    },
    get length() {
      return values.size
    },
  }
  return storage
}

async function loadComposable(storage: Storage) {
  vi.stubGlobal('localStorage', storage)
  vi.resetModules()
  const module = await import('./useLightAccent')
  const style = { setProperty: vi.fn() }
  vi.stubGlobal('document', { documentElement: { style } })
  return { ...module, style }
}

describe('useLightAccent', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('uses the default for missing or invalid storage without rewriting invalid data', async () => {
    const storage = createStorage({ 'auralis-light-accent': 'rgba(1,2,3,.5)' })
    const { useLightAccent } = await loadComposable(storage)
    const state = useLightAccent()
    state.initLightAccent()

    expect(state.lightAccent.value).toBe(DEFAULT_LIGHT_ACCENT)
    expect(storage.getItem('auralis-light-accent')).toBe('rgba(1,2,3,.5)')
    expect(storage.writes).toEqual([])
  })

  it('applies a valid stored value during initialization without rewriting storage', async () => {
    const storage = createStorage({ 'auralis-light-accent': '  #60a5fa  ' })
    const { useLightAccent, style } = await loadComposable(storage)
    const state = useLightAccent()
    state.initLightAccent()

    expect(state.lightAccent.value).toBe('#60A5FA')
    expect(style.setProperty).toHaveBeenCalledWith('--auralis-light-accent-source', '#60A5FA')
    expect(style.setProperty).toHaveBeenCalledWith(
      '--auralis-light-accent-soft',
      state.resolution.value.soft,
    )
    expect(storage.getItem('auralis-light-accent')).toBe('  #60a5fa  ')
    expect(storage.writes).toEqual([])
  })

  it('applies and persists valid edits while rejecting invalid input unchanged', async () => {
    const storage = createStorage()
    const { useLightAccent, style } = await loadComposable(storage)
    const state = useLightAccent()
    state.initLightAccent()

    expect(state.setLightAccent(' #22d3ee ')).toBe(true)
    expect(state.lightAccent.value).toBe('#22D3EE')
    expect(storage.getItem('auralis-light-accent')).toBe('#22D3EE')
    expect(state.setLightAccent('#22D3EE80')).toBe(false)
    expect(state.lightAccent.value).toBe('#22D3EE')
    expect(storage.getItem('auralis-light-accent')).toBe('#22D3EE')
    expect(style.setProperty).toHaveBeenCalledWith('--auralis-light-accent-source', '#22D3EE')
    expect(style.setProperty).toHaveBeenCalledWith(
      '--auralis-light-on-accent',
      state.resolution.value.onAccent,
    )
  })

  it('keeps the session value after write failure and retries on a same-value edit', async () => {
    const storage = createStorage({}, { failWrites: true })
    const { useLightAccent } = await loadComposable(storage)
    const state = useLightAccent()

    state.setLightAccent('#C084FC')
    expect(state.lightAccent.value).toBe('#C084FC')
    expect(state.persistFailed.value).toBe(true)

    storage.options.failWrites = false
    state.setLightAccent('#C084FC')
    expect(state.persistFailed.value).toBe(false)
    expect(storage.getItem('auralis-light-accent')).toBe('#C084FC')
    expect(storage.writes).toEqual(['auralis-light-accent', 'auralis-light-accent'])
  })

  it('persists explicit resets even when already using the default', async () => {
    const storage = createStorage()
    const { useLightAccent } = await loadComposable(storage)
    useLightAccent().resetLightAccent()

    expect(storage.getItem('auralis-light-accent')).toBe(DEFAULT_LIGHT_ACCENT)
    expect(storage.writes).toEqual(['auralis-light-accent'])
  })

  it('defaults for read failures and does not overwrite the inaccessible preference', async () => {
    const storage = createStorage({}, { failReads: true })
    const { useLightAccent } = await loadComposable(storage)
    expect(useLightAccent().lightAccent.value).toBe(DEFAULT_LIGHT_ACCENT)
    expect(storage.writes).toEqual([])
  })

  it('keeps light and dark storage keys and CSS variables independent', async () => {
    const storage = createStorage({
      'auralis-dark-accent': '#22D3EE',
      'auralis-light-accent': '#585B5F',
    })
    vi.stubGlobal('localStorage', storage)
    vi.resetModules()
    const [{ useLightAccent }, { useDarkAccent }] = await Promise.all([
      import('./useLightAccent'),
      import('./useDarkAccent'),
    ])
    const style = { setProperty: vi.fn() }
    vi.stubGlobal('document', { documentElement: { style } })
    const light = useLightAccent()
    const dark = useDarkAccent()
    light.initLightAccent()
    dark.initDarkAccent()
    style.setProperty.mockClear()
    storage.writes.length = 0

    light.setLightAccent('#FB7185')
    expect(storage.writes).toEqual(['auralis-light-accent'])
    expect(storage.getItem('auralis-dark-accent')).toBe('#22D3EE')
    expect(style.setProperty.mock.calls.map(([property]) => property)).toEqual([
      '--auralis-light-accent-source',
      '--auralis-light-accent',
      '--auralis-light-accent-soft',
      '--auralis-light-on-accent',
    ])

    style.setProperty.mockClear()
    storage.writes.length = 0
    dark.setDarkAccent('#C084FC')
    expect(storage.writes).toEqual(['auralis-dark-accent'])
    expect(storage.getItem('auralis-light-accent')).toBe('#FB7185')
    expect(style.setProperty.mock.calls.map(([property]) => property)).toEqual([
      '--auralis-dark-accent-source',
      '--auralis-dark-accent',
      '--auralis-dark-on-accent',
    ])
  })
})
