import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import type { WebContents } from 'electron'
import { PlaybackFileCoordinator } from './playbackFileCoordinator'
import { RendererReadLeaseOwner } from './rendererReadLeaseOwner'

function setup() {
  const coordinator = new PlaybackFileCoordinator({
    getTrackFilePath: () => 'D:/Music/Review.flac',
    getTrackIdsByFilePath: () => [1],
    sendToRenderer: () => {},
  })
  const sender = Object.assign(new EventEmitter(), { id: 1, isDestroyed: () => false })
  const owners = new RendererReadLeaseOwner(coordinator)
  return { coordinator, sender, webContents: sender as unknown as WebContents, owners }
}

describe('renderer read lease ownership', () => {
  it.each(['destroyed', 'render-process-gone', 'navigation', 'shutdown'])(
    'cancels waiting reads on %s',
    async (event) => {
      const { coordinator, sender, webContents, owners } = setup()
      const writer = coordinator.tryAcquireWriteLease('D:/Music/Review.flac')
      if (!writer.ok) throw new Error('Expected writer')
      const pending = owners.acquire(webContents, 'D:/Music/Review.flac')
      const rejected = expect(pending).rejects.toThrow('aborted')
      if (event === 'navigation') sender.emit('did-start-navigation', {}, 'app://', false, true)
      else if (event === 'shutdown') owners.dispose()
      else sender.emit(event)
      await rejected
      coordinator.releaseWriteLease(writer.leaseId)
      expect(coordinator.getTrackState(1).status).toBe('editable')
      expect(sender.listenerCount('destroyed')).toBe(0)
    },
  )

  it('releases a grant if destruction occurs before the awaiting continuation', async () => {
    const { coordinator, sender, webContents, owners } = setup()
    const pending = owners.acquire(webContents, 'D:/Music/Review.flac')
    sender.emit('destroyed')
    await expect(pending).rejects.toThrow('cancelled')
    expect(coordinator.getTrackState(1).status).toBe('editable')
  })

  it('releases granted reads after a crash and rejects cross-window release', async () => {
    const { coordinator, sender, webContents, owners } = setup()
    const lease = await owners.acquire(webContents, 'D:/Music/Review.flac')
    owners.release({ id: 2 } as WebContents, lease.leaseId)
    expect(coordinator.getTrackState(1).status).toBe('playback-in-use')
    sender.emit('render-process-gone')
    expect(coordinator.getTrackState(1).status).toBe('editable')
  })

  it('keeps ownership on same-document or subframe navigation', async () => {
    const { coordinator, sender, webContents, owners } = setup()
    const lease = await owners.acquire(webContents, 'D:/Music/Review.flac')
    sender.emit('did-start-navigation', {}, 'app://', true, true)
    sender.emit('did-start-navigation', {}, 'app://', false, false)
    expect(coordinator.getTrackState(1).status).toBe('playback-in-use')
    owners.release(webContents, lease.leaseId)
    expect(coordinator.getTrackState(1).status).toBe('editable')
    owners.dispose()
  })
})
