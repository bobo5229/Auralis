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
    tracker.end()
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
})
