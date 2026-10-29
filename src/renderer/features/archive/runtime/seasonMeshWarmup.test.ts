import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class WarmupWorker {
  static instances: WarmupWorker[] = []
  onmessage: ((event: { data: { type: string } }) => void) | null = null
  onerror: ((event: { preventDefault: () => void }) => void) | null = null
  onmessageerror: (() => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor() {
    WarmupWorker.instances.push(this)
  }
}

let idle: (() => void) | undefined
let visibility: ReturnType<typeof vi.fn>
let motion: EventTarget & { matches: boolean }
let documentState: EventTarget & { hidden: boolean }

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  WarmupWorker.instances = []
  idle = undefined
  visibility = vi.fn().mockResolvedValue({ isVisible: true })
  motion = Object.assign(new EventTarget(), { matches: false })
  documentState = Object.assign(new EventTarget(), {
    hidden: false,
    createElement: () => ({ transferControlToOffscreen: () => ({}) }),
  })
  vi.stubGlobal('Worker', WarmupWorker)
  vi.stubGlobal('OffscreenCanvas', class {})
  vi.stubGlobal('document', documentState)
  vi.stubGlobal('window', {
    matchMedia: () => motion,
    auralis: { window: { getVisibility: visibility } },
    requestIdleCallback: vi.fn((callback) => {
      idle = callback
      return 1
    }),
    cancelIdleCallback: vi.fn(() => {
      idle = undefined
    }),
  })
})

afterEach(async () => {
  const { takeSeasonMeshWarmup } = await import('./seasonMeshWarmup')
  takeSeasonMeshWarmup()?.worker.terminate()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function start() {
  const api = await import('./seasonMeshWarmup')
  api.scheduleSeasonMeshWarmup()
  idle?.()
  await Promise.resolve()
  return api
}

describe('season mesh idle preparation', () => {
  it('waits for idle, prepares once, and releases an unused paused worker after 30 seconds', async () => {
    const api = await import('./seasonMeshWarmup')
    api.scheduleSeasonMeshWarmup()
    api.scheduleSeasonMeshWarmup()
    expect(window.requestIdleCallback).toHaveBeenCalledOnce()
    expect(WarmupWorker.instances).toHaveLength(0)
    idle?.()
    await Promise.resolve()
    const worker = WarmupWorker.instances[0]
    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith(
      { type: 'warmup', canvas: expect.any(Object) },
      [expect.any(Object)],
    )
    worker.onmessage?.({ data: { type: 'warmed' } })
    expect(worker.terminate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(29_999)
    expect(worker.terminate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    api.scheduleSeasonMeshWarmup()
    expect(WarmupWorker.instances).toHaveLength(1)
  })

  it.each([false, true])(
    'hands off the same worker before/after readiness (%s) and removes its expiry timer',
    async (ready) => {
      const api = await start()
      const worker = WarmupWorker.instances[0]
      if (ready) worker.onmessage?.({ data: { type: 'warmed' } })
      const taken = api.takeSeasonMeshWarmup()
      expect(taken?.worker).toBe(worker)
      expect(taken?.canvas).toBeDefined()
      worker.onmessage?.({ data: { type: 'warmed' } })
      vi.advanceTimersByTime(35_000)
      expect(worker.terminate).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
      expect(api.takeSeasonMeshWarmup()).toBeUndefined()
      api.scheduleSeasonMeshWarmup()
      expect(WarmupWorker.instances).toHaveLength(1)
    },
  )

  it('cancels queued work when the foreground page enters', async () => {
    const api = await import('./seasonMeshWarmup')
    api.scheduleSeasonMeshWarmup()
    expect(api.takeSeasonMeshWarmup()).toBeUndefined()
    expect(window.cancelIdleCallback).toHaveBeenCalledWith(1)
    expect(WarmupWorker.instances).toHaveLength(0)
    api.scheduleSeasonMeshWarmup()
    expect(window.requestIdleCallback).toHaveBeenCalledOnce()
  })

  it('does not start after cancellation during the native visibility request', async () => {
    let resolve!: (value: { isVisible: boolean }) => void
    visibility.mockReturnValue(
      new Promise((r) => {
        resolve = r
      }),
    )
    const api = await start()
    expect(api.takeSeasonMeshWarmup()).toBeUndefined()
    resolve({ isVisible: true })
    await Promise.resolve()
    expect(WarmupWorker.instances).toHaveLength(0)
  })

  it.each(['motion', 'document', 'native'] as const)(
    'skips preparation for inactive %s state',
    async (state) => {
      if (state === 'motion') motion.matches = true
      if (state === 'document') documentState.hidden = true
      if (state === 'native') visibility.mockResolvedValue({ isVisible: false })
      await start()
      expect(WarmupWorker.instances).toHaveLength(0)
    },
  )

  it.each(['motion', 'document'] as const)(
    'stops ongoing preparation when %s becomes inactive',
    async (state) => {
      await start()
      if (state === 'motion') {
        motion.matches = true
        motion.dispatchEvent(Object.assign(new Event('change'), { matches: true }))
      } else {
        documentState.hidden = true
        documentState.dispatchEvent(new Event('visibilitychange'))
      }
      expect(WarmupWorker.instances[0].terminate).toHaveBeenCalledOnce()
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it('bounds a stuck worker and ignores a late completion', async () => {
    await start()
    const worker = WarmupWorker.instances[0]
    vi.advanceTimersByTime(5000)
    worker.onmessage?.({ data: { type: 'warmed' } })
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('bounds a stuck visibility lookup without creating a worker afterward', async () => {
    let resolve!: (value: { isVisible: boolean }) => void
    visibility.mockReturnValue(
      new Promise((r) => {
        resolve = r
      }),
    )
    await start()
    vi.advanceTimersByTime(5000)
    resolve({ isVisible: true })
    await Promise.resolve()
    expect(WarmupWorker.instances).toHaveLength(0)
  })

  it('releases a failed worker without surfacing a background preparation error', async () => {
    await start()
    const preventDefault = vi.fn()
    WarmupWorker.instances[0].onerror?.({ preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(WarmupWorker.instances[0].terminate).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
})
