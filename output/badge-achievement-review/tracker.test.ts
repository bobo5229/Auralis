import { afterEach, expect, it, vi } from 'vitest'
import { ListeningProgressTracker } from '../../src/renderer/features/playback/core/listeningProgressTracker'
import { parseDomainIpcPayload } from '../../src/main/ipc/ipcPayloadValidation'
import type { ListeningProgressBatch } from '../../src/shared/types/badgeAchievements'

const trackers: ListeningProgressTracker[] = []
afterEach(() => { for (const tracker of trackers.splice(0)) tracker.dispose(); vi.useRealTimers() })
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
function fixture(getEpoch: () => Promise<number>, record: (batch: ListeningProgressBatch) => Promise<{ ok: boolean; epoch: number }>) {
  vi.useFakeTimers()
  let time = 0
  const snapshot = { trackId: 1 as number | null, position: 0, duration: 100, playing: true, hasData: true }
  const errors: unknown[] = []
  const tracker = new ListeningProgressTracker({ getEpoch, record, snapshot: () => snapshot, onError: error => errors.push(error), now: () => time, epochNow: () => Date.UTC(2026, 9, 29) + time })
  trackers.push(tracker)
  return { tracker, snapshot, errors, tick(seconds = 1) { time += seconds * 1000; snapshot.position += seconds; tracker.sample() }, advance(seconds = 1) { time += seconds * 1000 } }
}

it('drains a post-reset paused tail after the previous in-flight write replies', async () => {
  let epoch = 0
  const old = deferred<{ ok: boolean; epoch: number }>()
  const record = vi.fn<(batch: ListeningProgressBatch) => Promise<{ ok: boolean; epoch: number }>>()
    .mockImplementationOnce(() => old.promise)
    .mockImplementation(async () => ({ ok: true, epoch }))
  const f = fixture(async () => epoch, record)
  await settle(); f.tracker.start(1)
  for (let i = 0; i < 5; i++) f.tick()
  await settle()
  epoch = 1; f.tracker.discardPendingRecords(); await settle()
  f.tick(); f.tracker.setPlaying(false); await settle()
  expect(record).toHaveBeenCalledTimes(1)
  old.resolve({ ok: true, epoch: 0 }); await settle()
  await vi.advanceTimersByTimeAsync(4000)
  expect(record).toHaveBeenCalledTimes(2)
  expect(record.mock.calls[1][0]).toMatchObject({ epoch: 1, samples: [expect.objectContaining({ startSeconds: 5, endSeconds: 6 })] })
})

it('keeps every emitted batch within the IPC resource limit after a delayed epoch read', async () => {
  const epoch = deferred<number>()
  const record = vi.fn(async (batch: ListeningProgressBatch) => {
    parseDomainIpcPayload('playback:record-listening-progress', [batch])
    return { ok: true, epoch: 0 }
  })
  const f = fixture(() => epoch.promise, record)
  f.tracker.start(1)
  for (let i = 0; i < 34; i++) f.tick()
  epoch.resolve(0); await settle(); f.tick(); await settle()
  expect(record).toHaveBeenCalled()
  expect(Math.max(...record.mock.calls.map(([batch]) => batch.samples.length))).toBeLessThanOrEqual(32)
  expect(f.errors).toHaveLength(0)
})

it('retains a natural final interval when native ended publishes idle before onEnded', async () => {
  const record = vi.fn(async (_batch: ListeningProgressBatch) => ({ ok: true, epoch: 0 }))
  const f = fixture(async () => 0, record)
  await settle(); f.snapshot.position = 99; f.tracker.start(1)
  f.advance(1)
  Object.assign(f.snapshot, { trackId: null, position: 100, playing: false, hasData: false })
  // nativePlaybackRuntime.receive updates snapshot, then onPlayingChange,
  // onBufferingChange and finally onEnded in exactly this order.
  f.tracker.setPlaying(false); f.tracker.setBuffering(false); f.tracker.finish(100)
  await settle()
  const seconds = record.mock.calls.flatMap(([batch]) => batch.samples).reduce((sum, sample) => sum + sample.playedSeconds, 0)
  expect(seconds).toBe(1)
})
