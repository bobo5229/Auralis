import { beforeEach, describe, expect, it, vi } from 'vitest'

interface StorageOptions {
  failReads?: boolean
  failWrites?: boolean
}

function createStorage(
  initial: Record<string, string> = {},
  options: StorageOptions = {},
): Storage & { values: Map<string, string>; options: StorageOptions; writes: number } {
  const values = new Map(Object.entries(initial))
  return {
    values,
    options,
    writes: 0,
    getItem(key) {
      if (options.failReads) throw new Error('read blocked')
      return values.get(key) ?? null
    },
    setItem(key, value) {
      this.writes += 1
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
}

async function loadComposable(storage: Storage) {
  vi.stubGlobal('localStorage', storage)
  vi.resetModules()
  const module = await import('./useDarkAccent')
  const style = { setProperty: vi.fn() }
  vi.stubGlobal('document', { documentElement: { style } })
  return { ...module, style }
}

describe('useDarkAccent', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('uses the default for missing or invalid storage without rewriting invalid data', async () => {
    const storage = createStorage({ 'auralis-dark-accent': 'rgba(1,2,3,.5)' })
    const { useDarkAccent } = await loadComposable(storage)
    const state = useDarkAccent()
    state.initDarkAccent()

    expect(state.darkAccent.value).toBe('#F472B6')
    expect(storage.getItem('auralis-dark-accent')).toBe('rgba(1,2,3,.5)')
    expect(storage.writes).toBe(0)
  })

  it('applies a valid stored value during initialization and restores it on reload', async () => {
    const storage = createStorage({ 'auralis-dark-accent': '  #60a5fa  ' })
    const { useDarkAccent, style } = await loadComposable(storage)
    const state = useDarkAccent()
    state.initDarkAccent()

    expect(state.darkAccent.value).toBe('#60A5FA')
    expect(style.setProperty).toHaveBeenCalledWith('--auralis-dark-accent-source', '#60A5FA')
    expect(style.setProperty).toHaveBeenCalledWith('--auralis-dark-accent', '#60A5FA')
    expect(storage.getItem('auralis-dark-accent')).toBe('  #60a5fa  ')
  })

  it('applies and persists valid edits while rejecting invalid input unchanged', async () => {
    const storage = createStorage()
    const { useDarkAccent, style } = await loadComposable(storage)
    const state = useDarkAccent()
    state.initDarkAccent()

    expect(state.setDarkAccent(' #22d3ee ')).toBe(true)
    expect(state.darkAccent.value).toBe('#22D3EE')
    expect(storage.getItem('auralis-dark-accent')).toBe('#22D3EE')
    expect(state.setDarkAccent('#22D3EE80')).toBe(false)
    expect(state.darkAccent.value).toBe('#22D3EE')
    expect(storage.getItem('auralis-dark-accent')).toBe('#22D3EE')
    expect(style.setProperty).toHaveBeenCalledWith('--auralis-dark-accent-source', '#22D3EE')
  })

  it('keeps the session value after write failure and retries on a same-value edit', async () => {
    const storage = createStorage({}, { failWrites: true })
    const { useDarkAccent } = await loadComposable(storage)
    const state = useDarkAccent()

    state.setDarkAccent('#C084FC')
    expect(state.darkAccent.value).toBe('#C084FC')
    expect(state.persistFailed.value).toBe(true)

    storage.options.failWrites = false
    state.setDarkAccent('#C084FC')
    expect(state.persistFailed.value).toBe(false)
    expect(storage.getItem('auralis-dark-accent')).toBe('#C084FC')
    expect(storage.writes).toBe(2)
  })

  it('resets through the same apply-and-persist path', async () => {
    const storage = createStorage()
    const { useDarkAccent } = await loadComposable(storage)
    const state = useDarkAccent()

    state.setDarkAccent('#818CF8')
    state.resetDarkAccent()

    expect(state.darkAccent.value).toBe('#F472B6')
    expect(storage.getItem('auralis-dark-accent')).toBe('#F472B6')
  })

  it('persists an explicit reset when already using the default', async () => {
    const storage = createStorage()
    const { useDarkAccent } = await loadComposable(storage)
    useDarkAccent().resetDarkAccent()

    expect(storage.getItem('auralis-dark-accent')).toBe('#F472B6')
    expect(storage.writes).toBe(1)
  })

  it('defaults for read failures and does not overwrite the inaccessible preference', async () => {
    const storage = createStorage({}, { failReads: true })
    const { useDarkAccent } = await loadComposable(storage)
    expect(useDarkAccent().darkAccent.value).toBe('#F472B6')
    expect(storage.writes).toBe(0)
  })
})
