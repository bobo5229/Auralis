import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'
import { PlaybackFileCoordinator } from './playbackFileCoordinator'
import { RendererReadLeaseOwner } from './rendererReadLeaseOwner'

function setup() {
  const coordinator = new PlaybackFileCoordinator({
    getTrackFilePath: () => 'D:/Music/Review.flac',
  })
  const release = vi.spyOn(coordinator, 'releaseReadLease')
  const sender = Object.assign(new EventEmitter(), { id: 1, isDestroyed: () => false })
  const owners = new RendererReadLeaseOwner(coordinator)
  return { coordinator, release, sender, webContents: sender as unknown as WebContents, owners }
}

describe('renderer read lease ownership', () => {
  it.each(['destroyed', 'render-process-gone', 'navigation', 'shutdown'])(
    'releases an interrupted grant on %s',
    async (event) => {
      const { release, sender, webContents, owners } = setup()
      const pending = owners.acquire(webContents, 'D:/Music/Review.flac')
      const rejected = expect(pending).rejects.toThrow('cancelled')
      if (event === 'navigation') sender.emit('did-start-navigation', {}, 'app://', false, true)
      else if (event === 'shutdown') owners.dispose()
      else sender.emit(event)
      await rejected
      expect(release).toHaveBeenCalledOnce()
      expect(sender.listenerCount('destroyed')).toBe(0)
    },
  )

  it('releases a grant if destruction occurs before the awaiting continuation', async () => {
    const { release, sender, webContents, owners } = setup()
    const pending = owners.acquire(webContents, 'D:/Music/Review.flac')
    sender.emit('destroyed')
    await expect(pending).rejects.toThrow('cancelled')
    expect(release).toHaveBeenCalledOnce()
  })

  it('releases granted reads after a crash and rejects cross-window release', async () => {
    const { coordinator, release, sender, webContents, owners } = setup()
    const lease = await owners.acquire(webContents, 'D:/Music/Review.flac')
    owners.release({ id: 2 } as WebContents, lease.leaseId)
    expect(coordinator.isReadLeaseForTrack(lease.leaseId, 1, 'D:/Music/Review.flac')).toBe(true)
    sender.emit('render-process-gone')
    expect(release).toHaveBeenCalledOnce()
  })

  it('keeps ownership on same-document or subframe navigation', async () => {
    const { coordinator, release, sender, webContents, owners } = setup()
    const lease = await owners.acquire(webContents, 'D:/Music/Review.flac')
    sender.emit('did-start-navigation', {}, 'app://', true, true)
    sender.emit('did-start-navigation', {}, 'app://', false, false)
    expect(coordinator.isReadLeaseForTrack(lease.leaseId, 1, 'D:/Music/Review.flac')).toBe(true)
    owners.release(webContents, lease.leaseId)
    expect(release).toHaveBeenCalledOnce()
    owners.dispose()
  })
})
