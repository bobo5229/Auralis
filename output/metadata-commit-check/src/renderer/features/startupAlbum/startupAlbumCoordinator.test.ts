import { afterEach, describe, expect, it, vi } from 'vitest'
import { startStartupAlbum } from './startupAlbumCoordinator'

function setup() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  let ready = false
  let visible = true
  let resolve!: (value: string | null) => void
  let reject!: (error: Error) => void
  let signal!: AbortSignal
  const hooks = {
    ready: new Set<() => void>(),
    interact: new Set<() => void>(),
    failed: new Set<() => void>(),
  }
  const subscribe = (name: keyof typeof hooks, listener: () => void) => {
    hooks[name].add(listener)
    return () => {
      hooks[name].delete(listener)
    }
  }
  const show = vi.fn()
  const reportError = vi.fn()
  const work = new Promise<string | null>((yes, no) => {
    resolve = yes
    reject = no
  })
  const stop = startStartupAlbum({
    prepare: (value) => {
      signal = value
      return work
    },
    isReady: () => ready,
    canShow: () => visible,
    onReady: (listener) => subscribe('ready', listener),
    onInteract: (listener) => subscribe('interact', listener),
    onFailed: (listener) => subscribe('failed', listener),
    show,
    reportError,
  })
  return {
    show,
    reportError,
    resolve,
    reject,
    stop,
    hooks,
    signal: () => signal,
    ready() {
      ready = true
      hooks.ready.forEach((listener) => listener())
    },
    visibility(value: boolean) {
      visible = value
      hooks.ready.forEach((listener) => listener())
    },
    interact() {
      hooks.interact.forEach((listener) => listener())
    },
    fail() {
      hooks.failed.forEach((listener) => listener())
    },
  }
}
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})
describe('startup album scheduling', () => {
  it('prepares during splash and displays exactly once only after retirement', async () => {
    const env = setup()
    env.resolve('album')
    await vi.advanceTimersByTimeAsync(5000)
    expect(env.show).not.toHaveBeenCalled()
    env.ready()
    env.ready()
    expect(env.show).toHaveBeenCalledExactlyOnceWith('album')
    expect([...Object.values(env.hooks)].every((set) => !set.size)).toBe(true)
  })
  it('permits preparation within one second after splash', async () => {
    const env = setup()
    env.ready()
    await vi.advanceTimersByTimeAsync(999)
    env.resolve('album')
    await vi.advanceTimersByTimeAsync(0)
    expect(env.show).toHaveBeenCalledExactlyOnceWith('album')
  })
  it('aborts on timeout and ignores late data', async () => {
    const env = setup()
    env.ready()
    await vi.advanceTimersByTimeAsync(1000)
    expect(env.signal().aborted).toBe(true)
    env.resolve('late album')
    await vi.advanceTimersByTimeAsync(0)
    expect(env.show).not.toHaveBeenCalled()
  })
  it('expires from splash retirement while hidden and never opens after restore', async () => {
    const env = setup()
    env.visibility(false)
    env.resolve('album')
    await vi.advanceTimersByTimeAsync(5000)
    env.ready()
    expect(env.show).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1600)
    env.visibility(true)
    expect(env.show).not.toHaveBeenCalled()
    expect(env.signal().aborted).toBe(true)
    expect(Object.values(env.hooks).every((set) => !set.size)).toBe(true)
  })
  it('can display on restore within the original retirement deadline', async () => {
    const env = setup()
    env.visibility(false)
    env.resolve('album')
    await vi.advanceTimersByTimeAsync(0)
    env.ready()
    await vi.advanceTimersByTimeAsync(999)
    env.visibility(true)
    expect(env.show).toHaveBeenCalledExactlyOnceWith('album')
  })
  it('cancels on interaction while a prepared card is waiting for visibility', async () => {
    const env = setup()
    env.visibility(false)
    env.resolve('album')
    await vi.advanceTimersByTimeAsync(0)
    env.ready()
    env.interact()
    env.visibility(true)
    expect(env.show).not.toHaveBeenCalled()
    expect(env.signal().aborted).toBe(true)
  })
  it('checks the deadline on restore even if the timeout callback has been delayed', async () => {
    const env = setup()
    env.visibility(false)
    env.resolve('album')
    await vi.advanceTimersByTimeAsync(0)
    env.ready()
    vi.spyOn(performance, 'now').mockReturnValue(1001)
    env.visibility(true)
    expect(env.show).not.toHaveBeenCalled()
    expect(env.signal().aborted).toBe(true)
  })
  it.each(['interaction', 'failure', 'unmount'] as const)(
    'cancels on %s and never opens later',
    async (reason) => {
      const env = setup()
      env.ready()
      await vi.advanceTimersByTimeAsync(0)
      if (reason === 'interaction') env.interact()
      else if (reason === 'failure') env.fail()
      else env.stop()
      env.resolve('late album')
      await vi.advanceTimersByTimeAsync(1500)
      expect(env.show).not.toHaveBeenCalled()
      expect(env.signal().aborted).toBe(true)
      expect(Object.values(env.hooks).every((set) => !set.size)).toBe(true)
    },
  )
  it('silently skips an empty library', async () => {
    const env = setup()
    env.ready()
    env.resolve(null)
    await vi.advanceTimersByTimeAsync(0)
    expect(env.show).not.toHaveBeenCalled()
    expect(env.reportError).not.toHaveBeenCalled()
  })
  it('reports failed preparation without delaying startup', async () => {
    const env = setup()
    const error = new Error('query failed')
    env.reject(error)
    await vi.advanceTimersByTimeAsync(0)
    env.ready()
    expect(env.reportError).toHaveBeenCalledExactlyOnceWith(error)
    expect(env.show).not.toHaveBeenCalled()
  })
})
