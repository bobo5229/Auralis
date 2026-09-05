import { describe, expect, it, vi } from 'vitest'
import type { WarmableRouteName } from './routeComponentLoaders'
import { createRouteWarmupCoordinator, type IdleCallback, type IdleScheduler } from './routeWarmup'

class MockIdleScheduler implements IdleScheduler {
  private callbacks = new Map<number, IdleCallback>()
  private nextHandle = 1

  requestIdleCallback(callback: IdleCallback): number {
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
  it('prefetches route on intent and marks it as warmed', async () => {
    const loadMock = vi.fn().mockResolvedValue({ default: {} })
    const coordinator = createRouteWarmupCoordinator({
      loadRoute: loadMock,
    })

    expect(coordinator.isRouteWarmed('albums')).toBe(false)
    await coordinator.prefetchRouteOnIntent('albums')

    expect(loadMock).toHaveBeenCalledWith('albums')
    expect(coordinator.isRouteWarmed('albums')).toBe(true)

    // Second intent prefetch should be a no-op
    await coordinator.prefetchRouteOnIntent('albums')
    expect(loadMock).toHaveBeenCalledTimes(1)
  })

  it('runs idle warmup sequentially: Albums -> Archive -> Settings', async () => {
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

    // Trigger first idle -> albums
    await scheduler.triggerNext()
    expect(loaded).toEqual(['albums'])
    expect(scheduler.pendingCount).toBe(1)

    // Trigger second idle -> archive
    await scheduler.triggerNext()
    expect(loaded).toEqual(['albums', 'archive'])
    expect(scheduler.pendingCount).toBe(1)

    // Trigger third idle -> settings
    await scheduler.triggerNext()
    expect(loaded).toEqual(['albums', 'archive', 'settings'])
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
    // albums should be first
    await scheduler.triggerNext()
    expect(loaded).toEqual(['archive', 'albums'])

    // Next idle should skip archive and load settings
    await scheduler.triggerNext()
    expect(loaded).toEqual(['archive', 'albums', 'settings'])
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
    expect(loadMock).toHaveBeenCalledWith('albums')
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
