import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MotionQuery } from './motionPreference'

const key = 'auralis-reduced-motion'
const values = new Map<string, string>()

function fakeSystem(initial = false) {
  const target = Object.assign(new EventTarget(), { matches: initial })
  return Object.assign(target, {
    emit(matches: boolean) {
      target.matches = matches
      target.dispatchEvent(Object.assign(new Event('change'), { matches }))
    },
  }) as unknown as MotionQuery & { emit(matches: boolean): void }
}

beforeEach(() => {
  values.clear()
  vi.resetModules()
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => values.set(name, value),
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('motion preference', () => {
  it('follows system changes by default and stops notifying removed listeners', async () => {
    const state = await import('./motionPreference')
    const system = fakeSystem()
    const query = state.createReducedMotionQuery(() => system)
    const changed = vi.fn()
    query.addEventListener('change', changed)
    expect(state.getMotionPreference()).toBe('system')
    expect(query.matches).toBe(false)
    system.emit(true)
    expect(query.matches).toBe(true)
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ matches: true }))
    query.removeEventListener('change', changed)
    system.emit(false)
    state.setMotionPreference('reduce')
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it('forces reduced motion live, persists it and resumes the current system preference', async () => {
    const state = await import('./motionPreference')
    const system = fakeSystem()
    const query = state.createReducedMotionQuery(() => system)
    const changed = vi.fn()
    query.addEventListener('change', changed)
    state.setMotionPreference('reduce')
    expect(query.matches).toBe(true)
    expect(values.get(key)).toBe('reduce')
    system.emit(true)
    system.emit(false)
    expect(changed).toHaveBeenCalledTimes(1)
    state.setMotionPreference('system')
    expect(query.matches).toBe(false)
    expect(changed).toHaveBeenCalledTimes(2)
    query.removeEventListener('change', changed)
  })

  it('restores a saved preference on module reload and rejects invalid stored values', async () => {
    const state = await import('./motionPreference')
    state.setMotionPreference('reduce')
    vi.resetModules()
    const restored = await import('./motionPreference')
    expect(restored.getMotionPreference()).toBe('reduce')
    expect(restored.createReducedMotionQuery(() => fakeSystem()).matches).toBe(true)
    values.set(key, 'invalid')
    vi.resetModules()
    expect((await import('./motionPreference')).getMotionPreference()).toBe('system')
  })

  it('keeps the current session responsive when storage fails and can retry saving', async () => {
    const state = await import('./motionPreference')
    const setItem = vi.fn((): void => {
      throw new Error('storage unavailable')
    })
    vi.stubGlobal('localStorage', { getItem: () => null, setItem })
    state.setMotionPreference('reduce')
    expect(state.createReducedMotionQuery(() => fakeSystem()).matches).toBe(true)
    expect(state.hasMotionPreferenceSaveFailed()).toBe(true)
    setItem.mockImplementation(() => undefined)
    state.setMotionPreference('reduce')
    expect(state.hasMotionPreferenceSaveFailed()).toBe(false)
  })

  it('supports abort signals and once listeners without leaking app subscriptions', async () => {
    const state = await import('./motionPreference')
    const system = fakeSystem()
    const query = state.createReducedMotionQuery(() => system)
    const controller = new AbortController()
    const aborted = vi.fn()
    const once = vi.fn()
    query.addEventListener('change', aborted, { signal: controller.signal })
    query.addEventListener('change', once, { once: true })
    controller.abort()
    state.setMotionPreference('reduce')
    state.setMotionPreference('system')
    system.emit(true)
    expect(aborted).not.toHaveBeenCalled()
    expect(once).toHaveBeenCalledTimes(1)
  })

  it('updates the CSS root and synchronizes other-window storage changes', async () => {
    const state = await import('./motionPreference')
    const system = fakeSystem()
    const win = Object.assign(new EventTarget(), { matchMedia: () => system })
    const root = { dataset: {} as Record<string, string> }
    vi.stubGlobal('window', win)
    vi.stubGlobal('document', { documentElement: root })
    const dispose = state.initMotionPreference()
    expect(root.dataset.reducedMotion).toBe('false')
    state.setMotionPreference('reduce')
    expect(root.dataset.reducedMotion).toBe('true')
    values.set(key, 'system')
    win.dispatchEvent(Object.assign(new Event('storage'), { key }))
    expect(state.getMotionPreference()).toBe('system')
    expect(root.dataset.reducedMotion).toBe('false')
    system.emit(true)
    expect(root.dataset.reducedMotion).toBe('true')
    dispose()
    system.emit(false)
    expect(root.dataset.reducedMotion).toBe('true')
  })
})
