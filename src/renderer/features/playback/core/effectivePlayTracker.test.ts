import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EffectivePlayTracker, type EffectivePlayPayload } from './effectivePlayTracker'

describe('EffectivePlayTracker', () => {
  let now = 0
  let countable = true
  let duration = 100
  let recordEffectivePlay: ReturnType<
    typeof vi.fn<(payload: EffectivePlayPayload) => Promise<{ ok: boolean }>>
  >
  let tracker: EffectivePlayTracker

  beforeEach(() => {
    vi.useFakeTimers()
    now = 0
    countable = true
    duration = 100
    recordEffectivePlay = vi.fn(async () => ({ ok: true }))
    tracker = new EffectivePlayTracker({
      isPlaybackCountable: () => countable,
      getDurationSeconds: () => duration,
      recordEffectivePlay,
      monotonicNow: () => now,
      epochNow: () => 1_700_000_000_000,
      randomToken: () => 'token',
    })
  })

  afterEach(() => {
    tracker.dispose()
    vi.useRealTimers()
  })

  function playFor(seconds: number): void {
    for (let elapsed = 0; elapsed < seconds; elapsed += 2.5) {
      now += Math.min(2.5, seconds - elapsed) * 1000
      tracker.sample()
    }
  }

  it('records once after 55 percent of real playback', async () => {
    tracker.start(7)

    playFor(54)
    expect(recordEffectivePlay).not.toHaveBeenCalled()
    playFor(1.1)
    expect(recordEffectivePlay).toHaveBeenCalledTimes(1)
    await recordEffectivePlay.mock.results[0].value

    expect(recordEffectivePlay).toHaveBeenCalledWith({
      trackId: 7,
      sessionId: '7-1700000000000-token',
      playedAtIso: '2023-11-14T22:13:20.000Z',
    })
    playFor(10)
    expect(recordEffectivePlay).toHaveBeenCalledTimes(1)
  })

  it('counts playback despite repeated unchanged buffering events', () => {
    duration = 10
    tracker.start(7)

    for (let tick = 1; tick <= 60; tick += 1) {
      now += 100
      tracker.setBuffering(false)
      if (tick % 10 === 0) tracker.sample()
      if (tick === 50) expect(recordEffectivePlay).not.toHaveBeenCalled()
    }

    expect(recordEffectivePlay).toHaveBeenCalledTimes(1)
  })

  it('does not count buffering, seeking, or paused time', () => {
    tracker.start(7)
    tracker.setBuffering(true)
    playFor(30)
    tracker.setBuffering(false)
    tracker.beginSeekingWithFallback()
    playFor(30)
    tracker.endSeeking()
    countable = false
    playFor(30)

    expect(recordEffectivePlay).not.toHaveBeenCalled()
  })

  it('caps a delayed sample so suspended time is not treated as playback', () => {
    tracker.start(7)
    now += 60_000
    tracker.sample()

    expect(recordEffectivePlay).not.toHaveBeenCalled()
  })

  it('retries persistence failures on a later sample', async () => {
    recordEffectivePlay
      .mockRejectedValueOnce(new Error('database busy'))
      .mockResolvedValueOnce({ ok: true })
    tracker.start(7)
    playFor(55.1)
    expect(recordEffectivePlay).toHaveBeenCalledTimes(1)
    await recordEffectivePlay.mock.results[0].value.catch(() => undefined)
    await Promise.resolve()

    now += 1_000
    tracker.sample()
    expect(recordEffectivePlay).toHaveBeenCalledTimes(2)
  })

  it.each([0, 4.99, 86_401])('ignores invalid duration %s', (invalidDuration) => {
    duration = invalidDuration
    tracker.start(7)
    playFor(100)

    expect(recordEffectivePlay).not.toHaveBeenCalled()
  })

  it('counts an exact 55 percent boundary', () => {
    tracker.start(7)
    playFor(55)
    expect(recordEffectivePlay).toHaveBeenCalledTimes(1)
  })

  it('settles playback before buffering and seeking without counting the blocked intervals', () => {
    duration = 10
    tracker.start(7)
    now += 2_000
    countable = false
    tracker.setBuffering(true)
    playFor(30)
    countable = true
    tracker.setBuffering(false)
    now += 2_000
    tracker.beginSeekingWithFallback()
    playFor(30)
    tracker.endSeeking()
    now += 1_500
    tracker.setPlaying(false)

    expect(recordEffectivePlay).toHaveBeenCalledTimes(1)
  })

  it('uses the old duration and playback state when the backend has crossed a boundary', () => {
    duration = 10
    tracker.start(7)
    playFor(5)
    now += 600
    duration = 100
    countable = false
    tracker.end()

    expect(recordEffectivePlay).toHaveBeenCalledTimes(1)
    expect(recordEffectivePlay.mock.calls[0][0].trackId).toBe(7)
  })

  it('retries an ended session with the original timestamp even after midnight', async () => {
    let epoch = new Date('2026-10-01T15:59:59.000Z').getTime()
    tracker.dispose()
    tracker = new EffectivePlayTracker({
      isPlaybackCountable: () => countable,
      getDurationSeconds: () => duration,
      recordEffectivePlay,
      monotonicNow: () => now,
      epochNow: () => epoch,
      randomToken: () => 'retry-token',
    })
    recordEffectivePlay.mockRejectedValueOnce(new Error('database busy'))
    tracker.start(7)
    playFor(55)
    await recordEffectivePlay.mock.results[0].value.catch(() => undefined)
    tracker.end()

    epoch += 5_000
    now += 1_000
    await vi.advanceTimersByTimeAsync(1_000)

    expect(recordEffectivePlay).toHaveBeenCalledTimes(2)
    expect(recordEffectivePlay.mock.calls[1][0]).toEqual(recordEffectivePlay.mock.calls[0][0])
    expect(recordEffectivePlay.mock.calls[1][0].playedAtIso).toBe('2026-10-01T15:59:59.000Z')
  })

  it('does not overlap in-flight writes after switching sessions', async () => {
    let resolveRecord!: (result: { ok: boolean }) => void
    recordEffectivePlay.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRecord = resolve
      }),
    )
    tracker.start(7)
    playFor(55)
    tracker.start(8)
    now += 1_000
    await vi.advanceTimersByTimeAsync(1_000)
    expect(recordEffectivePlay).toHaveBeenCalledTimes(1)
    resolveRecord({ ok: true })
    await Promise.resolve()
    now += 1_000
    await vi.advanceTimersByTimeAsync(1_000)
    expect(recordEffectivePlay).toHaveBeenCalledTimes(1)
  })

  it('backs off repeated transient failures', async () => {
    recordEffectivePlay.mockRejectedValue(new Error('database busy'))
    tracker.start(7)
    playFor(55)
    tracker.end()
    await Promise.resolve()

    for (const delay of [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]) {
      const attempts = recordEffectivePlay.mock.calls.length
      now += delay - 1
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(recordEffectivePlay).toHaveBeenCalledTimes(attempts)
      now += 1
      await vi.advanceTimersByTimeAsync(1)
      expect(recordEffectivePlay).toHaveBeenCalledTimes(attempts + 1)
    }
  })

  it('does not keep retrying records rejected by main validation', async () => {
    recordEffectivePlay.mockResolvedValue({ ok: false })
    tracker.start(7)
    playFor(55)
    tracker.end()
    now += 60_000
    await vi.advanceTimersByTimeAsync(60_000)
    expect(recordEffectivePlay).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retries synchronous transport failures without interrupting playback sampling', async () => {
    recordEffectivePlay.mockImplementationOnce(() => {
      throw new Error('transport unavailable')
    })
    tracker.start(7)
    expect(() => playFor(55)).not.toThrow()
    tracker.end()
    now += 1_000
    await vi.advanceTimersByTimeAsync(1_000)
    expect(recordEffectivePlay).toHaveBeenCalledTimes(2)
  })

  it('cancels retries on disposal, including failures delivered after disposal', async () => {
    let rejectRecord!: (error: Error) => void
    recordEffectivePlay.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectRecord = reject
      }),
    )
    tracker.start(7)
    playFor(55)
    tracker.dispose()
    rejectRecord(new Error('late failure'))
    await Promise.resolve()
    tracker.start(8)
    now += 60_000
    await vi.advanceTimersByTimeAsync(60_000)
    expect(recordEffectivePlay).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([NaN, Infinity, -1])('does not count an invalid duration %s', (invalidDuration) => {
    duration = invalidDuration
    tracker.start(7)
    playFor(100)
    tracker.end()
    expect(recordEffectivePlay).not.toHaveBeenCalled()
  })
})
