import { expect, it, vi } from 'vitest'
import { NativePlaybackService } from './nativePlaybackService'
import { PlaybackFileCoordinator } from './playbackFileCoordinator'
import type { MpvClient } from './mpvClient'
import type { NativePlaybackSession } from './nativePlaybackSession'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function setup() {
  const path = 'D:/Music/Next.flac'
  const coordinator = new PlaybackFileCoordinator({
    getTrackFilePath: () => path,
    getTrackIdsByFilePath: () => [1],
    sendToRenderer: () => {},
  })
  const service = new NativePlaybackService({
    mpvPath: '',
    ffmpegPath: '',
    resolveTrack: async () => path,
    coordinator,
    emit: () => {},
    warn: () => {},
  })
  const state = service as unknown as {
    runtime: NativePlaybackSession
    scheduler: {
      enteringNext: { id: number; path: string } | null
      cancelNext: (client: MpvClient) => Promise<void>
    }
  }
  return { path, coordinator, service, state }
}

it('protects a preload until playlist-clear is acknowledged', async () => {
  const { path, coordinator, state, service } = setup()
  const lease = await coordinator.acquireReadLease(path, 'mpv-next')
  state.runtime.holdNextLease(lease.leaseId)
  const cleared = deferred()
  const pending = state.scheduler.cancelNext({ command: () => cleared.promise } as MpvClient)
  expect(coordinator.tryAcquireWriteLease(path)).toEqual({ ok: false, reason: 'playback-in-use' })
  cleared.resolve()
  await pending
  expect(coordinator.getTrackState(1).status).toBe('editable')
  await service.dispose()
})

it('keeps the lease of an item entering playback while cancellation awaits', async () => {
  const { path, coordinator, state, service } = setup()
  const lease = await coordinator.acquireReadLease(path, 'mpv-next')
  state.runtime.holdNextLease(lease.leaseId)
  const cleared = deferred()
  const pending = state.scheduler.cancelNext({ command: () => cleared.promise } as MpvClient)
  state.scheduler.enteringNext = { id: 1, path }
  cleared.resolve()
  await pending
  expect(state.runtime.nextLeaseId).toBe(lease.leaseId)
  expect(coordinator.getTrackState(1).status).toBe('playback-in-use')
  await service.dispose()
})

it('holds the read lease until the mpv process exits on stop', async () => {
  const { path, coordinator, state, service } = setup()
  state.runtime.holdCurrentLease((await coordinator.acquireReadLease(path, 'mpv-current')).leaseId)
  const exited = deferred()
  state.runtime.client = { close: vi.fn(() => exited.promise) } as unknown as MpvClient
  const stopped = service.command({ action: 'stop', session: 1 })
  expect(coordinator.tryAcquireWriteLease(path)).toEqual({ ok: false, reason: 'playback-in-use' })
  exited.resolve()
  await stopped
  expect(coordinator.getTrackState(1).status).toBe('editable')
})

it('releases only the old decoder lease when its exit arrives after a replacement session', async () => {
  const { path, coordinator, state, service } = setup()
  const exited = deferred()
  state.runtime.begin(1)
  state.runtime.holdCurrentLease((await coordinator.acquireReadLease(path, 'mpv-current')).leaseId)
  state.runtime.client = { close: vi.fn(() => exited.promise) } as unknown as MpvClient
  const stopped = service.command({ action: 'stop', session: 1 })
  state.runtime.begin(2)
  const replacement = await coordinator.acquireReadLease(path, 'mpv-current')
  state.runtime.holdCurrentLease(replacement.leaseId)
  exited.resolve()
  await stopped
  expect(state.runtime.currentLeaseId).toBe(replacement.leaseId)
  expect(coordinator.tryAcquireWriteLease(path)).toEqual({ ok: false, reason: 'playback-in-use' })
  await service.dispose()
  expect(coordinator.getTrackState(1).status).toBe('editable')
})
