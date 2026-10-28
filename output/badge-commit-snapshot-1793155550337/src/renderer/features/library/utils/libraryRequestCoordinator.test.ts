import { describe, expect, it, vi } from 'vitest'
import { LibraryRequestCoordinator } from './libraryRequestCoordinator'

describe('LibraryRequestCoordinator', () => {
  it('coalesces background refreshes while foreground loading is active', () => {
    const coordinator = new LibraryRequestCoordinator()
    const foreground = coordinator.begin('foreground')

    expect(foreground).toBe(1)
    expect(coordinator.begin('background')).toBeNull()
    expect(coordinator.begin('background')).toBeNull()

    const completion = coordinator.finish(foreground!)
    expect(completion).toEqual({
      ownedForeground: true,
      ownedBackground: false,
      ownedMetadataSave: false,
      shouldFlushBackground: true,
    })
    expect(coordinator.takePendingBackgroundRefreshIfReady()).toBe(false)
  })

  it('hands foreground completion to a waiting metadata save before background refresh', async () => {
    const coordinator = new LibraryRequestCoordinator()
    const foreground = coordinator.begin('foreground')!
    expect(coordinator.begin('background')).toBeNull()

    const onForegroundIdle = vi.fn()
    const foregroundIdle = coordinator.waitForForegroundIdle().then(onForegroundIdle)
    const foregroundCompletion = coordinator.finish(foreground)

    expect(foregroundCompletion.shouldFlushBackground).toBe(false)
    await foregroundIdle
    expect(onForegroundIdle).toHaveBeenCalledOnce()

    const metadataSave = coordinator.begin('metadata-save')!
    expect(coordinator.begin('background')).toBeNull()
    expect(coordinator.finish(metadataSave).shouldFlushBackground).toBe(true)
  })

  it('marks older requests stale when a newer lane starts', () => {
    const coordinator = new LibraryRequestCoordinator()
    const background = coordinator.begin('background')!
    const foreground = coordinator.begin('foreground')!

    expect(coordinator.isLatest(background)).toBe(false)
    expect(coordinator.isLatest(foreground)).toBe(true)
    expect(coordinator.finish(background).ownedForeground).toBe(false)
    expect(coordinator.finish(foreground).ownedForeground).toBe(true)
  })

  it('coalesces repeated background events while a catalog refresh is active', () => {
    const coordinator = new LibraryRequestCoordinator()
    const background = coordinator.begin('background')!

    expect(coordinator.begin('background')).toBeNull()
    expect(coordinator.begin('background')).toBeNull()

    const completion = coordinator.finish(background)
    expect(completion.ownedBackground).toBe(true)
    expect(completion.shouldFlushBackground).toBe(true)
  })

  it('invalidates requests and releases foreground waiters on unmount', async () => {
    const coordinator = new LibraryRequestCoordinator()
    const foreground = coordinator.begin('foreground')!
    const onForegroundIdle = vi.fn()
    const foregroundIdle = coordinator.waitForForegroundIdle().then(onForegroundIdle)

    coordinator.invalidate()
    await foregroundIdle

    expect(onForegroundIdle).toHaveBeenCalledOnce()
    expect(coordinator.isLatest(foreground)).toBe(false)
    expect(coordinator.begin('foreground')).toBeNull()
    expect(coordinator.takePendingBackgroundRefreshIfReady()).toBe(false)
  })
})
