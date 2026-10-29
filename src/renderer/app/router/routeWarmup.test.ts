import { describe, expect, it, vi } from 'vitest'
import type { WarmableRouteName } from './routeComponentLoaders'
import { createRouteWarmupCoordinator, type IdleCallback, type IdleScheduler } from './routeWarmup'

class MockIdleScheduler implements IdleScheduler {
  private callbacks = new Map<number, IdleCallback>()
  private nextHandle = 1
  readonly timeouts: Array<number | undefined> = []

  requestIdleCallback(callback: IdleCallback, options?: { timeout?: number }): number {
    this.timeouts.push(options?.timeout)
    const handle = this.nextHandle++
    this.callbacks.set(handle, callback)
    return handle
  }

  cancelIdleCallback(handle: number): void {
    this.callbacks.delete(handle)
  }

  async triggerNext(timeRemaining = 50, didTimeout = false) {
    const nextEntry = this.callbacks.entries().next().value
    if (!nextEntry) return false
    const [handle, cb] = nextEntry
    this.callbacks.delete(handle)
    await cb({
      timeRemaining: () => timeRemaining,
      didTimeout,
    })
    return true
  }

  get pendingCount() {
    return this.callbacks.size
  }
}

describe('routeWarmup', () => {
  it('schedules resource preparation only after a successful route load', async () => {
    const prepare = vi.fn()
    const loadRoute = vi
      .fn()
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValue({ default: {} })
    const coordinator = createRouteWarmupCoordinator({ loadRoute, onRouteWarmed: prepare })
    await coordinator.prefetchRouteOnIntent('archive')
    expect(prepare).not.toHaveBeenCalled()
    await coordinator.prefetchRouteOnIntent('archive')
    await coordinator.prefetchRouteOnIntent('archive')
    expect(prepare).toHaveBeenCalledExactlyOnceWith('archive')
  })

  it('prefetches the library route on intent and marks it as warmed', async () => {
    const loadMock = vi.fn().mockResolvedValue({ default: {} })
    const coordinator = createRouteWarmupCoordinator({
      loadRoute: loadMock,
    })

    expect(coordinator.isRouteWarmed('library')).toBe(false)
    await coordinator.prefetchRouteOnIntent('library')

    expect(loadMock).toHaveBeenCalledWith('library')
    expect(coordinator.isRouteWarmed('library')).toBe(true)

    // Second intent prefetch should be a no-op
    await coordinator.prefetchRouteOnIntent('library')
    expect(loadMock).toHaveBeenCalledTimes(1)
  })

  it('runs idle warmup sequentially: Library -> Albums -> Archive', async () => {
    const loaded: WarmableRouteName[] = []
    const loadMock = vi.fn().mockImplementation(async (name: WarmableRouteName) => {
      loaded.push(name)
      return { default: {} }
    })
    const scheduler = new MockIdleScheduler()

    const coordinator = createRouteWarmupCoordinator({
      loadRoute: loadMock,
      scheduler,
    })

    coordinator.schedulePrimaryRouteWarmup()
    expect(scheduler.pendingCount).toBe(1)
    expect(loaded).toEqual([])

    // Trigger first idle -> library
    await scheduler.triggerNext()
    expect(loaded).toEqual(['library'])
    expect(scheduler.pendingCount).toBe(1)

    // Trigger second idle -> albums
    await scheduler.triggerNext()
    expect(loaded).toEqual(['library', 'albums'])
    expect(scheduler.pendingCount).toBe(1)

    // Trigger third idle -> archive
    await scheduler.triggerNext()
    expect(loaded).toEqual(['library', 'albums', 'archive'])
    expect(scheduler.pendingCount).toBe(0)
    expect(coordinator._getPendingIdleQueue()).toEqual([])
  })

  it('skips routes already warmed via intent during subsequent idle runs', async () => {
    const loaded: WarmableRouteName[] = []
    const loadMock = vi.fn().mockImplementation(async (name: WarmableRouteName) => {
      loaded.push(name)
      return { default: {} }
    })
    const scheduler = new MockIdleScheduler()

    const coordinator = createRouteWarmupCoordinator({
      loadRoute: loadMock,
      scheduler,
    })

    // Pre-warm archive via intent before idle kicks in
    await coordinator.prefetchRouteOnIntent('archive')
    expect(loaded).toEqual(['archive'])

    coordinator.schedulePrimaryRouteWarmup()
    // library should be first
    await scheduler.triggerNext()
    expect(loaded).toEqual(['archive', 'library'])

    // Next idle should load albums and finish
    await scheduler.triggerNext()
    expect(loaded).toEqual(['archive', 'library', 'albums'])
    expect(scheduler.pendingCount).toBe(0)
  })

  it('yields and re-schedules when timeRemaining is below minimum and not timed out', async () => {
    const loadMock = vi.fn().mockResolvedValue({ default: {} })
    const scheduler = new MockIdleScheduler()

    const coordinator = createRouteWarmupCoordinator({
      loadRoute: loadMock,
      scheduler,
      minIdleTimeRemainingMs: 5,
    })

    coordinator.schedulePrimaryRouteWarmup()
    expect(scheduler.pendingCount).toBe(1)

    // Trigger with only 2ms left and no timeout
    scheduler.triggerNext(2, false)
    expect(loadMock).not.toHaveBeenCalled()
    expect(scheduler.pendingCount).toBe(1) // Re-scheduled

    // Now trigger with 10ms left
    scheduler.triggerNext(10, false)
    await Promise.resolve()
    expect(loadMock).toHaveBeenCalledWith('library')
  })

  it('starts asynchronous route loading in a short idle window', async () => {
    const loadRoute = vi.fn().mockResolvedValue({ default: {} })
    const scheduler = new MockIdleScheduler()
    const coordinator = createRouteWarmupCoordinator({ loadRoute, scheduler })

    coordinator.schedulePrimaryRouteWarmup()
    await scheduler.triggerNext(2)
    expect(loadRoute).toHaveBeenCalledExactlyOnceWith('library')
    coordinator.dispose()
  })

  it('bounds repeated short-idle deferrals without draining all routes in one callback', async () => {
    let time = 0
    const loadRoute = vi.fn().mockResolvedValue({ default: {} })
    const scheduler = new MockIdleScheduler()
    const coordinator = createRouteWarmupCoordinator({ loadRoute, scheduler, now: () => time })

    coordinator.schedulePrimaryRouteWarmup()
    for (time = 100; time < 1500; time += 100) {
      await scheduler.triggerNext(0.25)
      expect(loadRoute).not.toHaveBeenCalled()
      expect(scheduler.timeouts.at(-1)).toBe(1500 - time)
    }
    // Each callback itself is timely, but the route has waited its full allowance.
    await scheduler.triggerNext(0.25, false)
    expect(loadRoute).toHaveBeenCalledExactlyOnceWith('library')
    expect(scheduler.pendingCount).toBe(1)
    expect(scheduler.timeouts.at(-1)).toBe(1500)

    time = 1600
    await scheduler.triggerNext(0.25)
    expect(loadRoute).toHaveBeenCalledTimes(1)
    time = 3000
    await scheduler.triggerNext(0.25)
    expect(loadRoute).toHaveBeenLastCalledWith('albums')
    time = 4500
    await scheduler.triggerNext(0.25)
    expect(loadRoute).toHaveBeenLastCalledWith('archive')
    expect(loadRoute).toHaveBeenCalledTimes(3)
    expect(scheduler.pendingCount).toBe(0)
  })

  it('honors an idle scheduler timeout even without idle budget', async () => {
    const loadRoute = vi.fn().mockResolvedValue({ default: {} })
    const scheduler = new MockIdleScheduler()
    const coordinator = createRouteWarmupCoordinator({ loadRoute, scheduler })
    coordinator.schedulePrimaryRouteWarmup()
    await scheduler.triggerNext(0, true)
    expect(loadRoute).toHaveBeenCalledExactlyOnceWith('library')
    coordinator.dispose()
  })

  it('cancels deferred warmup before its deadline', async () => {
    let time = 0
    const loadRoute = vi.fn().mockResolvedValue({ default: {} })
    const scheduler = new MockIdleScheduler()
    const coordinator = createRouteWarmupCoordinator({ loadRoute, scheduler, now: () => time })
    coordinator.schedulePrimaryRouteWarmup()
    time = 500
    await scheduler.triggerNext(0)
    coordinator.dispose()
    time = 2000
    expect(await scheduler.triggerNext(0)).toBe(false)
    expect(loadRoute).not.toHaveBeenCalled()
  })

  it('allows retry on next intent or navigation if load fails, without marking warmed', async () => {
    let failCount = 0
    const loadMock = vi.fn().mockImplementation(async (name: WarmableRouteName) => {
      if (name === 'albums' && failCount === 0) {
        failCount++
        throw new Error('Load failed')
      }
      return { default: {} }
    })

    const coordinator = createRouteWarmupCoordinator({
      loadRoute: loadMock,
    })

    // Should catch gracefully
    await coordinator.prefetchRouteOnIntent('albums')
    expect(coordinator.isRouteWarmed('albums')).toBe(false)

    // Subsequent intent call should retry
    await coordinator.prefetchRouteOnIntent('albums')
    expect(coordinator.isRouteWarmed('albums')).toBe(true)
    expect(loadMock).toHaveBeenCalledTimes(2)
  })

  it('cancels pending idle callbacks and stops queue execution on dispose', () => {
    const loadMock = vi.fn().mockResolvedValue({ default: {} })
    const scheduler = new MockIdleScheduler()

    const coordinator = createRouteWarmupCoordinator({
      loadRoute: loadMock,
      scheduler,
    })

    coordinator.schedulePrimaryRouteWarmup()
    expect(scheduler.pendingCount).toBe(1)

    coordinator.dispose()
    expect(scheduler.pendingCount).toBe(0)
    expect(coordinator._getPendingIdleQueue()).toEqual([])

    // Intent after dispose should be no-op
    coordinator.prefetchRouteOnIntent('albums')
    expect(loadMock).not.toHaveBeenCalled()
  })
})
