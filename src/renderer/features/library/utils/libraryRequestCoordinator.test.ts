import { describe, expect, it } from 'vitest'
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
      shouldFlushBackground: true,
    })
    expect(coordinator.takePendingBackgroundRefreshIfReady()).toBe(false)
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

  it('invalidates requests on unmount', () => {
    const coordinator = new LibraryRequestCoordinator()
    const foreground = coordinator.begin('foreground')!

    coordinator.invalidate()

    expect(coordinator.isLatest(foreground)).toBe(false)
    expect(coordinator.begin('foreground')).toBeNull()
    expect(coordinator.takePendingBackgroundRefreshIfReady()).toBe(false)
  })
})
