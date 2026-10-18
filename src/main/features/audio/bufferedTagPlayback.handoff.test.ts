import { expect, it, vi } from 'vitest'
import { PlaybackFileCoordinator } from './playbackFileCoordinator'
import { retainCommittedPlaybackLease } from './bufferedTagPlayback'

const filePath = 'D:/isolated/buffered-handoff.flac'

function coordinatorFor(): PlaybackFileCoordinator {
  return new PlaybackFileCoordinator({
    getTrackFilePath: () => filePath,
    getTrackIdsByFilePath: () => [1],
    sendToRenderer: () => {},
  })
}

function writeLease(coordinator: PlaybackFileCoordinator): string {
  const lease = coordinator.tryAcquireWriteLease(filePath)
  if (!lease.ok) throw new Error('expected a write lease')
  return lease.leaseId
}

it('holds the handed read lease while this attempt still owns an empty session', () => {
  const coordinator = coordinatorFor()
  const intent = writeLease(coordinator)
  let held: string | null = null
  retainCommittedPlaybackLease({
    current: () => true,
    currentLeaseId: () => held,
    coordinator,
    intent,
    hold: (leaseId) => {
      held = leaseId
    },
  })
  expect(held).toMatch(/^lease_read_/)
  coordinator.releaseWriteLease(intent)
  expect(coordinator.tryAcquireWriteLease(filePath)).toEqual({
    ok: false,
    reason: 'playback-in-use',
  })
  coordinator.releaseReadLease(held!)
  expect(coordinator.tryAcquireWriteLease(filePath).ok).toBe(true)
})

it('keeps the write lease when the attempt is no longer current', () => {
  const coordinator = coordinatorFor()
  const intent = writeLease(coordinator)
  const hold = vi.fn()
  retainCommittedPlaybackLease({
    current: () => false,
    currentLeaseId: () => null,
    coordinator,
    intent,
    hold,
  })
  expect(hold).not.toHaveBeenCalled()
  expect(coordinator.tryAcquireWriteLease(filePath)).toEqual({
    ok: false,
    reason: 'write-in-progress',
  })
  coordinator.releaseWriteLease(intent)
  expect(coordinator.tryAcquireWriteLease(filePath).ok).toBe(true)
})

it('keeps the write lease when the session already holds a read lease', () => {
  const coordinator = coordinatorFor()
  const intent = writeLease(coordinator)
  const hold = vi.fn()
  retainCommittedPlaybackLease({
    current: () => true,
    currentLeaseId: () => 'lease_read_existing',
    coordinator,
    intent,
    hold,
  })
  expect(hold).not.toHaveBeenCalled()
  coordinator.releaseWriteLease(intent)
  expect(coordinator.tryAcquireWriteLease(filePath).ok).toBe(true)
})

it('releases the handed read lease when playback moves during handoff', () => {
  const coordinator = coordinatorFor()
  const intent = writeLease(coordinator)
  let current = true
  let stored: string | null = null
  const handoff = coordinator.handoffWriteLeaseToRead.bind(coordinator)
  let handedId = ''
  coordinator.handoffWriteLeaseToRead = (leaseId, sourceId) => {
    const handed = handoff(leaseId, sourceId)
    handedId = handed.leaseId
    current = false
    stored = 'lease_read_next'
    return handed
  }
  const hold = vi.fn()
  const release = vi.spyOn(coordinator, 'releaseReadLease')
  retainCommittedPlaybackLease({
    current: () => current,
    currentLeaseId: () => stored,
    coordinator,
    intent,
    hold,
  })
  expect(hold).not.toHaveBeenCalled()
  expect(release).toHaveBeenCalledExactlyOnceWith(handedId)
  expect(stored).toBe('lease_read_next')
  expect(coordinator.tryAcquireWriteLease(filePath).ok).toBe(true)
})

it('releases only the handed read lease when a lease id is stored during handoff', () => {
  const coordinator = coordinatorFor()
  const intent = writeLease(coordinator)
  let stored: string | null = null
  const handoff = coordinator.handoffWriteLeaseToRead.bind(coordinator)
  let handedId = ''
  coordinator.handoffWriteLeaseToRead = (leaseId, sourceId) => {
    const handed = handoff(leaseId, sourceId)
    handedId = handed.leaseId
    stored = 'lease_read_next'
    return handed
  }
  const hold = vi.fn()
  const release = vi.spyOn(coordinator, 'releaseReadLease')
  retainCommittedPlaybackLease({
    current: () => true,
    currentLeaseId: () => stored,
    coordinator,
    intent,
    hold,
  })
  expect(hold).not.toHaveBeenCalled()
  expect(release).toHaveBeenCalledExactlyOnceWith(handedId)
  expect(stored).toBe('lease_read_next')
  expect(coordinator.tryAcquireWriteLease(filePath).ok).toBe(true)
})

it('requires handoff only while the attempt still needs a read lease', () => {
  const coordinator = coordinatorFor()
  const intent = writeLease(coordinator)
  const withoutHandoff = {
    acquireReadLease: coordinator.acquireReadLease.bind(coordinator),
    isReadLeaseForTrack: coordinator.isReadLeaseForTrack.bind(coordinator),
    releaseReadLease: coordinator.releaseReadLease.bind(coordinator),
    releaseWriteLease: coordinator.releaseWriteLease.bind(coordinator),
  }
  expect(() =>
    retainCommittedPlaybackLease({
      current: () => false,
      currentLeaseId: () => null,
      coordinator: withoutHandoff,
      intent,
      hold: vi.fn(),
    }),
  ).not.toThrow()
  expect(() =>
    retainCommittedPlaybackLease({
      current: () => true,
      currentLeaseId: () => null,
      coordinator: withoutHandoff,
      intent,
      hold: vi.fn(),
    }),
  ).toThrow('File handoff is unavailable')
  coordinator.releaseWriteLease(intent)
  expect(coordinator.tryAcquireWriteLease(filePath).ok).toBe(true)
})
