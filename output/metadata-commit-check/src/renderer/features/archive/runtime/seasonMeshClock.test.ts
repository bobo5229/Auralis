import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSeasonMeshClock } from './seasonMeshClock'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('season mesh clock', () => {
  it('resumes a cached phase while keeping the existing 30 Hz speed', () => {
    const draw = vi.fn()
    const clock = createSeasonMeshClock(draw, 12)
    clock.setPlaying(true)
    vi.advanceTimersByTime(1001)
    expect(draw).toHaveBeenCalledTimes(30)
    expect(draw.mock.lastCall?.[0]).toBeCloseTo(13, 2)
    clock.setPlaying(false)
    vi.advanceTimersByTime(5000)
    clock.setPlaying(true)
    vi.advanceTimersByTime(1001)
    expect(draw.mock.lastCall?.[0]).toBeCloseTo(14, 2)
    clock.setPlaying(false)
  })

  it('draws 30 times per second without scheduling display-rate callbacks', () => {
    const draw = vi.fn()
    const clock = createSeasonMeshClock(draw)
    clock.setPlaying(true)
    clock.setPlaying(true)
    // Allow the final timeout's rounding to the next integer millisecond.
    vi.advanceTimersByTime(1001)
    expect(draw).toHaveBeenCalledTimes(30)
    expect(draw.mock.lastCall?.[0]).toBeCloseTo(1, 2)
    expect(vi.getTimerCount()).toBe(1)
    clock.setPlaying(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves animation speed across pause and resume without counting hidden time', () => {
    const draw = vi.fn()
    const clock = createSeasonMeshClock(draw)
    clock.setPlaying(true)
    vi.advanceTimersByTime(1001)
    clock.setPlaying(false)
    vi.advanceTimersByTime(5000)
    expect(draw).toHaveBeenCalledTimes(30)
    clock.setPlaying(true)
    vi.advanceTimersByTime(1001)
    expect(draw).toHaveBeenCalledTimes(60)
    expect(draw.mock.lastCall?.[0]).toBeCloseTo(2, 2)
    clock.setPlaying(false)
  })

  it('does not rearm a timer when stopped during a frame', () => {
    const clock = createSeasonMeshClock(() => clock.setPlaying(false))
    clock.setPlaying(true)
    vi.advanceTimersByTime(1000)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('caps delayed-frame advancement and skips catch-up bursts', () => {
    const draw = vi.fn()
    const clock = createSeasonMeshClock(draw)
    clock.setPlaying(true)
    vi.spyOn(performance, 'now').mockReturnValue(1000)
    vi.advanceTimersByTime(34)
    expect(draw).toHaveBeenCalledOnce()
    expect(draw).toHaveBeenLastCalledWith(0.1)
    expect(vi.getTimerCount()).toBe(1)
    clock.setPlaying(false)
  })
})
