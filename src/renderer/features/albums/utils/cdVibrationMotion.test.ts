import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCdVibrationMotion, CD_VIBRATION_MAX_PX } from './cdVibrationMotion'
import type { PlaybackSpectrumFrame } from '@shared/types/playbackSpectrum'

afterEach(() => vi.unstubAllGlobals())
describe('CD vibration lifetime', () => {
  it('shares amplitude but gives elastic motion a delayed rise and a bounded return', () => {
    let now = 1000,
      id = 0
    const pending = new Map<number, FrameRequestCallback>()
    vi.stubGlobal('performance', { now: () => now })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      pending.set(++id, callback)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (key: number) => pending.delete(key))
    const smoothPaint = vi.fn(),
      elasticPaint = vi.fn()
    const smooth = createCdVibrationMotion(smoothPaint),
      elastic = createCdVibrationMotion(elasticPaint, () => 'elastic')
    const frame: PlaybackSpectrumFrame = {
      subscriptionId: 1,
      sequence: 1,
      epoch: 1,
      trackId: 1,
      currentTime: 30,
      status: 'ready',
      bass: 0.2,
      rms: 0.2,
      bands: Array(32).fill(0),
    }
    const advance = (bass: number) => {
      now += 1000 / 60
      frame.currentTime += 1 / 60
      smooth.receive({ ...frame, bass })
      elastic.receive({ ...frame, bass })
      const callbacks = [...pending.values()]
      pending.clear()
      callbacks.forEach((callback) => callback(now))
    }
    advance(0.2)
    expect(elasticPaint.mock.lastCall![0]).toBeLessThan(smoothPaint.mock.lastCall![0])
    for (let i = 0; i < 15; i++) advance(0.2)
    for (let i = 0; i < 90; i++) advance(0)
    expect(smoothPaint.mock.calls.every(([value]) => value >= 0 && value <= 6)).toBe(true)
    expect(elasticPaint.mock.calls.every(([value]) => value >= -0.72 && value <= 6)).toBe(true)
    expect(smoothPaint).toHaveBeenLastCalledWith(0)
    expect(elasticPaint).toHaveBeenLastCalledWith(0)
    smooth.stop()
    elastic.stop()
    expect(pending.size).toBe(0)
  })
  it('bounds screen displacement and stops on pause, stale data, seek epochs and disable', () => {
    let now = 1000,
      id = 0
    const pending = new Map<number, FrameRequestCallback>()
    vi.stubGlobal('performance', { now: () => now })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      pending.set(++id, callback)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (key: number) => pending.delete(key))
    const paint = vi.fn()
    const motion = createCdVibrationMotion(paint)
    const frame: PlaybackSpectrumFrame = {
      subscriptionId: 1,
      sequence: 1,
      epoch: 1,
      trackId: 1,
      currentTime: 30,
      status: 'ready',
      bass: 1,
      rms: 1,
      bands: Array(32).fill(1),
    }
    function advance(milliseconds: number) {
      now += milliseconds
      const callbacks = [...pending.values()]
      pending.clear()
      callbacks.forEach((callback) => callback(now))
    }
    motion.receive(frame)
    for (let i = 0; i < 12; i++) advance(1000 / 60)
    expect(paint.mock.calls.some(([value]) => Math.abs(value) > 0.5)).toBe(true)
    expect(paint.mock.calls.every(([value]) => value >= 0 && value <= CD_VIBRATION_MAX_PX)).toBe(
      true,
    )
    motion.receive({ ...frame, status: 'paused' })
    expect(pending.size).toBe(0)
    expect(paint).toHaveBeenLastCalledWith(0)
    motion.receive(frame)
    advance(350)
    expect(pending.size).toBe(0)
    expect(paint).toHaveBeenLastCalledWith(0)
    motion.receive(frame)
    advance(16)
    motion.receive({ ...frame, epoch: 2, currentTime: 65, bass: 0 })
    expect(pending.size).toBe(0)
    expect(paint).toHaveBeenLastCalledWith(0)
    motion.receive({ ...frame, epoch: 2 })
    motion.stop()
    expect(pending.size).toBe(0)
    motion.receive({ ...frame, bass: 0.00001 })
    expect(pending.size).toBe(0)
  })
})
