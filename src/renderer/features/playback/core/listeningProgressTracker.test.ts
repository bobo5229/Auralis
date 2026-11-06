import type { ListeningProgressBatch } from '@shared/types/listeningEvidence'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ListeningProgressTracker } from './listeningProgressTracker'
let tracker: ListeningProgressTracker,
  time = 0,
  date = 0
let snapshot = {
  trackId: 1 as number | null,
  position: 0,
  duration: 100,
  playing: true,
  hasData: true,
}
const record = vi.fn<(batch: ListeningProgressBatch) => Promise<{ ok: boolean; epoch: number }>>(
    async () => ({ ok: true, epoch: 0 }),
  ),
  onError = vi.fn()
const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}
function tick(seconds = 1, advance = seconds) {
  time += seconds * 1000
  date += seconds * 1000
  snapshot.position += advance
  tracker.sample()
}
beforeEach(async () => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  time = 0
  date = new Date(2026, 9, 28, 12).getTime()
  snapshot = { trackId: 1, position: 0, duration: 100, playing: true, hasData: true }
  record.mockResolvedValue({ ok: true, epoch: 0 })
  tracker = new ListeningProgressTracker({
    getEpoch: async () => 0,
    record,
    snapshot: () => snapshot,
    onError,
    now: () => time,
    epochNow: () => date,
  })
  await settle()
  tracker.start(1)
})
afterEach(() => {
  tracker.dispose()
  vi.useRealTimers()
})
it('records played content and flushes final partial batches on pause', async () => {
  for (let i = 0; i < 5; i++) tick()
  await settle()
  expect(record).toHaveBeenCalledTimes(1)
  expect(record.mock.calls[0][0]).toMatchObject({ epoch: 0, trackId: 1, sequence: 1 })
  expect(record.mock.calls[0][0].samples[0]).toMatchObject({
    startSeconds: 0,
    endSeconds: 1,
    playedSeconds: 1,
  })
  tick()
  tracker.setPlaying(false)
  await settle()
  expect(record).toHaveBeenCalledTimes(2)
  expect(record.mock.calls[1][0].samples).toHaveLength(1)
})
it('does not count pauses, buffering, seeks or suspended-clock gaps', async () => {
  tracker.setPlaying(false)
  tick(1, 0)
  tracker.setPlaying(true)
  tracker.setBuffering(true)
  tick(1, 0)
  tracker.setBuffering(false)
  tracker.beginSeekingWithFallback()
  snapshot.position = 70
  tracker.endSeeking()
  tick(8, 8)
  tick()
  tracker.end()
  await settle()
  expect(record.mock.calls[0][0].samples).toEqual([
    expect.objectContaining({ startSeconds: 78, endSeconds: 79, playedSeconds: 1 }),
  ])
})
it('retries an identical batch instead of counting it twice', async () => {
  record.mockRejectedValueOnce(new Error('busy'))
  for (let i = 0; i < 5; i++) tick()
  await settle()
  const batch = record.mock.calls[0][0]
  await vi.advanceTimersByTimeAsync(2000)
  expect(record.mock.calls[1][0]).toEqual(batch)
})
it('drops evidence collected before a history reset', async () => {
  for (let i = 0; i < 4; i++) tick()
  tracker.discardPendingRecords()
  await settle()
  tick()
  tracker.end()
  await settle()
  expect(record.mock.calls[0][0].samples).toHaveLength(1)
  expect(record.mock.calls[0][0].samples[0].startSeconds).toBe(4)
})
it('settles the natural tail even after the backend exposes the next track', async () => {
  snapshot.position = 98
  tracker.end()
  tracker.start(1)
  time += 1000
  date += 1000
  snapshot = { ...snapshot, trackId: 2, position: 0 }
  tracker.finish(99)
  await settle()
  expect(record.mock.calls[0][0].samples[0]).toMatchObject({
    startSeconds: 98,
    endSeconds: 99,
    playedSeconds: 1,
  })
})

it('drains a new paused tail when an old request settles after reset', async () => {
  let release!: (value: { ok: boolean; epoch: number }) => void
  record.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  for (let i = 0; i < 5; i++) tick()
  await settle()
  tracker.discardPendingRecords()
  await settle()
  tick()
  tracker.setPlaying(false)
  await settle()
  expect(record).toHaveBeenCalledTimes(1)
  release({ ok: true, epoch: 0 })
  await settle()
  expect(record).toHaveBeenCalledTimes(2)
  expect(record.mock.calls[1][0].samples).toHaveLength(1)
})
it('retains bounded batches across tracks until the first epoch read recovers', async () => {
  tracker.dispose()
  let release!: (value: number) => void
  tracker = new ListeningProgressTracker({
    getEpoch: () =>
      new Promise((resolve) => {
        release = resolve
      }),
    record,
    snapshot: () => snapshot,
    onError,
    now: () => time,
    epochNow: () => date,
  })
  tracker.start(1)
  for (let i = 0; i < 34; i++) tick()
  tracker.end()
  expect(record).not.toHaveBeenCalled()
  release(0)
  await settle()
  expect(record.mock.calls.flatMap(([batch]) => batch.samples)).toHaveLength(34)
  expect(record.mock.calls.every(([batch]) => batch.samples.length <= 32)).toBe(true)
})
it('settles the final native interval before playing=false resets its baseline', async () => {
  snapshot.duration = 5
  for (let i = 0; i < 4; i++) tick()
  time += 1000
  date += 1000
  snapshot = { ...snapshot, trackId: null, position: 5, playing: false }
  tracker.setPlaying(false)
  tracker.setBuffering(false)
  tracker.finish(5)
  await settle()
  const samples = record.mock.calls.flatMap(([batch]) => batch.samples)
  expect(samples.reduce((seconds, sample) => seconds + sample.playedSeconds, 0)).toBe(5)
  expect(samples.at(-1)).toMatchObject({ startSeconds: 4, endSeconds: 5 })
})
it('unchanged native status events do not turn every progress event into a sample', async () => {
  for (let i = 0; i < 20; i++) {
    time += 200
    date += 200
    snapshot.position += 0.2
    tracker.setPlaying(true)
    tracker.setBuffering(false)
  }
  expect(record).not.toHaveBeenCalled()
  // The regular timer settles the measured interval, ignoring the suspended-sized gap.
  tracker.sample()
  tick()
  tracker.end()
  await settle()
  expect(record.mock.calls[0][0].samples).toHaveLength(1)
})

it('drains the final partial batch before shutdown completes', async () => {
  tick(2, 2)
  let release!: (value: { ok: boolean; epoch: number }) => void
  record.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  let done = false
  const closing = tracker.shutdown().then(() => {
    done = true
  })
  await settle()
  expect(done).toBe(false)
  expect(record).toHaveBeenCalledTimes(1)
  expect(record.mock.calls[0][0].samples[0].playedSeconds).toBe(2)
  release({ ok: true, epoch: 0 })
  await closing
  tracker.start(2)
  await vi.advanceTimersByTimeAsync(10000)
  expect(record).toHaveBeenCalledTimes(1)
})
it('waits for an in-flight batch and then drains the remaining samples', async () => {
  let release!: (value: { ok: boolean; epoch: number }) => void
  record.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  for (let i = 0; i < 5; i++) tick()
  tick()
  const closing = tracker.shutdown()
  release({ ok: true, epoch: 0 })
  await closing
  expect(record).toHaveBeenCalledTimes(2)
  expect(record.mock.calls[1][0].samples).toHaveLength(1)
})
it('reports a failed final save and stops retries', async () => {
  tick()
  record.mockRejectedValueOnce(new Error('write failed'))
  await expect(tracker.shutdown()).rejects.toThrow('Unable to save final listening progress')
  await vi.advanceTimersByTimeAsync(10000)
  expect(record).toHaveBeenCalledTimes(1)
})

it('retains the failed final batch for explicit shutdown retries', async () => {
  tick()
  record.mockRejectedValueOnce(new Error('write failed'))
  await expect(tracker.shutdown()).rejects.toThrow('Unable to save final listening progress')
  const batch = record.mock.calls[0][0]
  record.mockRejectedValueOnce(new Error('still unavailable'))
  await expect(tracker.shutdown()).rejects.toThrow('Unable to save final listening progress')
  await expect(tracker.shutdown()).resolves.toBeUndefined()
  expect(record.mock.calls.map(([value]) => value)).toEqual([batch, batch, batch])
  await tracker.shutdown()
  expect(record).toHaveBeenCalledTimes(3)
  expect(vi.getTimerCount()).toBe(0)
})

it('shares an overlapping shutdown attempt without sending the batch twice', async () => {
  tick()
  let release!: (value: { ok: boolean; epoch: number }) => void
  record.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  const first = tracker.shutdown()
  const second = tracker.shutdown()
  expect(second).toBe(first)
  release({ ok: true, epoch: 0 })
  await Promise.all([first, second])
  expect(record).toHaveBeenCalledOnce()
})

it('does not replay final evidence after a concurrent history reset', async () => {
  tick()
  record.mockResolvedValueOnce({ ok: false, epoch: 1 })
  await expect(tracker.shutdown()).resolves.toBeUndefined()
  expect(record).toHaveBeenCalledOnce()
})

it('allows another shutdown after the server rejects an invalid final batch', async () => {
  tick()
  record.mockResolvedValueOnce({ ok: false, epoch: 0 })
  await expect(tracker.shutdown()).rejects.toThrow('Unable to save final listening progress')
  await expect(tracker.shutdown()).resolves.toBeUndefined()
  expect(record).toHaveBeenCalledOnce()
})

it('bounds a stalled save and does not send queued batches after timeout', async () => {
  let release!: (value: { ok: boolean; epoch: number }) => void
  record.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  for (let i = 0; i < 6; i++) tick()
  const closing = expect(tracker.shutdown()).rejects.toThrow('timed out')
  await vi.advanceTimersByTimeAsync(2000)
  await closing
  release({ ok: true, epoch: 0 })
  await settle()
  await vi.advanceTimersByTimeAsync(10000)
  expect(record).toHaveBeenCalledTimes(1)
  await expect(tracker.shutdown()).resolves.toBeUndefined()
  expect(record).toHaveBeenCalledTimes(2)
  expect(record.mock.calls[1][0].samples).toHaveLength(1)
  expect(record.mock.calls[1][0].samples[0].startSeconds).toBe(5)
})

it('retries a timed-out exit while the original save is still pending', async () => {
  let release!: (value: { ok: boolean; epoch: number }) => void
  record.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  for (let i = 0; i < 6; i++) tick()
  const timedOut = expect(tracker.shutdown()).rejects.toThrow('timed out')
  await vi.advanceTimersByTimeAsync(2000)
  await timedOut
  const retry = tracker.shutdown()
  release({ ok: true, epoch: 0 })
  await retry
  expect(record).toHaveBeenCalledTimes(2)
  expect(record.mock.calls.map(([batch]) => batch.sequence)).toEqual([1, 2])
  expect(vi.getTimerCount()).toBe(0)
})

it('keeps reset-era samples pending when an older save settles after exit times out', async () => {
  let release!: (value: { ok: boolean; epoch: number }) => void
  record.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  for (let i = 0; i < 5; i++) tick()
  tracker.discardPendingRecords()
  await settle()
  tick()
  const timedOut = expect(tracker.shutdown()).rejects.toThrow('timed out')
  await vi.advanceTimersByTimeAsync(2000)
  await timedOut
  release({ ok: true, epoch: 0 })
  await settle()
  expect(record).toHaveBeenCalledOnce()
  await tracker.shutdown()
  expect(record).toHaveBeenCalledTimes(2)
  expect(record.mock.calls[1][0].samples).toHaveLength(1)
  expect(record.mock.calls[1][0].samples[0].startSeconds).toBe(5)
})

it('recovers an unavailable epoch on a later exit without losing the final sample', async () => {
  tracker.dispose()
  const getEpoch = vi
    .fn<() => Promise<number>>()
    .mockRejectedValueOnce(new Error('initial epoch unavailable'))
    .mockRejectedValueOnce(new Error('still unavailable'))
    .mockResolvedValue(0)
  tracker = new ListeningProgressTracker({
    getEpoch,
    record,
    snapshot: () => snapshot,
    onError,
    now: () => time,
    epochNow: () => date,
  })
  await settle()
  tracker.start(1)
  tick()
  await expect(tracker.shutdown()).rejects.toThrow('Unable to save final listening progress')
  expect(record).not.toHaveBeenCalled()
  await expect(tracker.shutdown()).resolves.toBeUndefined()
  expect(record).toHaveBeenCalledOnce()
  expect(record.mock.calls[0][0].samples).toHaveLength(1)
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['reset', 'retry'])(
  'waits for the current epoch during %s before draining shutdown',
  async (mode) => {
    tracker.dispose()
    let release!: (epoch: number) => void
    const getEpoch = vi.fn<() => Promise<number>>()
    if (mode === 'reset') getEpoch.mockResolvedValueOnce(0)
    else getEpoch.mockRejectedValueOnce(new Error('temporarily unavailable'))
    getEpoch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    tracker = new ListeningProgressTracker({
      getEpoch,
      record,
      snapshot: () => snapshot,
      onError,
      now: () => time,
      epochNow: () => date,
    })
    await settle()
    tracker.start(1)
    if (mode === 'reset') tracker.discardPendingRecords()
    else await vi.advanceTimersByTimeAsync(2000)
    tick()
    let done = false
    const closing = tracker.shutdown().then(() => {
      done = true
    })
    await settle()
    expect(done).toBe(false)
    expect(record).not.toHaveBeenCalled()
    record.mockResolvedValue({ ok: true, epoch: 1 })
    release(1)
    await closing
    expect(record).toHaveBeenCalledTimes(1)
    expect(record.mock.calls[0][0].epoch).toBe(1)
    expect(record.mock.calls[0][0].samples[0].playedSeconds).toBe(1)
  },
)
