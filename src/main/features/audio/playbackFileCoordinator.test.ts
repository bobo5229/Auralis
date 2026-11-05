import { describe, expect, it } from 'vitest'
import { PlaybackFileCoordinator } from './playbackFileCoordinator'

function setup() {
  const paths = new Map([
    [1, 'D:/music/song.flac'],
    [2, 'D:/music/song.flac'],
    [3, 'D:/music/other.flac'],
  ])
  const coordinator = new PlaybackFileCoordinator({
    getTrackFilePath: (id) => paths.get(id) ?? null,
  })
  return { paths, coordinator }
}

describe('read lease ownership', () => {
  it('rechecks the catalog and submitted path before loading a leased source', async () => {
    const { paths, coordinator } = setup()
    const path = paths.get(1)!
    const lease = await coordinator.acquireReadLease(path, 'mpv-current')
    expect(coordinator.isReadLeaseForTrack(lease.leaseId, 1, path)).toBe(true)
    expect(coordinator.isReadLeaseForTrack(lease.leaseId, 2, path)).toBe(true)
    expect(coordinator.isReadLeaseForTrack(lease.leaseId, 3, path)).toBe(false)
    expect(coordinator.isReadLeaseForTrack(lease.leaseId, 1, paths.get(3)!)).toBe(false)
    paths.set(1, 'D:/music/moved.flac')
    expect(coordinator.isReadLeaseForTrack(lease.leaseId, 1, path)).toBe(false)
    paths.delete(1)
    expect(coordinator.isReadLeaseForTrack(lease.leaseId, 1, path)).toBe(false)
    coordinator.releaseReadLease(lease.leaseId)
    expect(coordinator.isReadLeaseForTrack(lease.leaseId, 2, path)).toBe(false)
  })
  it('allows concurrent readers and releases only the requested owner', async () => {
    const { paths, coordinator } = setup()
    const path = paths.get(1)!
    const a = await coordinator.acquireReadLease(path, 'renderer:1')
    const b = await coordinator.acquireReadLease(path, 'renderer:2')
    const next = await coordinator.acquireReadLease(path, 'mpv-next')
    coordinator.markReadLeaseCurrent(next.leaseId)
    coordinator.releaseAllBySourceId('renderer:1')
    expect(coordinator.isReadLeaseForTrack(a.leaseId, 1, path)).toBe(false)
    expect(coordinator.isReadLeaseForTrack(b.leaseId, 1, path)).toBe(true)
    coordinator.releaseAllBySourceId('mpv-next')
    expect(coordinator.isReadLeaseForTrack(next.leaseId, 1, path)).toBe(true)
    coordinator.releaseAllBySourceId('mpv-current')
    expect(coordinator.isReadLeaseForTrack(next.leaseId, 1, path)).toBe(false)
    coordinator.releaseReadLease(b.leaseId)
    coordinator.releaseReadLease(b.leaseId)
    expect(coordinator.isReadLeaseForTrack(b.leaseId, 1, path)).toBe(false)
    expect(b.version).toBeGreaterThan(a.version)
  })
  it('rejects cancelled requests without retaining a lease', async () => {
    const { coordinator, paths } = setup()
    const controller = new AbortController()
    controller.abort()
    await expect(
      coordinator.acquireReadLease(paths.get(1)!, 'renderer:1', controller.signal),
    ).rejects.toThrow('aborted')
    const lease = await coordinator.acquireReadLease(paths.get(1)!, 'renderer:1')
    expect(lease.version).toBe(1)
    coordinator.releaseReadLease(lease.leaseId)
  })
})
