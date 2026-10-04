import { describe, expect, it } from 'vitest'
import { BassEnvelope } from './bassEnvelope'

describe('bounded Butterchurn bass envelope', () => {
  it('responds to strength without amplifying silence or quiet bass to full motion', () => {
    const quiet = new BassEnvelope(),
      loud = new BassEnvelope()
    for (let i = 0; i < 300; i++) {
      expect(quiet.update(0, 1 / 60)).toBe(0)
      loud.update(0.2, 1 / 60)
    }
    expect(loud.value).toBeGreaterThan(0.5)
    expect(loud.value).toBeLessThanOrEqual(1)
    for (let i = 0; i < 300; i++) quiet.update(0.001, 1 / 60)
    expect(quiet.value).toBeLessThan(0.02)
    for (let i = 0; i < 60; i++) loud.update(0, 1 / 60)
    expect(loud.value).toBe(0)
  })

  it('has the same attack/release at different rendering rates and resets immediately', () => {
    const sample = (fps: number) => {
      const envelope = new BassEnvelope()
      for (let i = 0; i < fps / 2; i++) envelope.update(0.12, 1 / fps)
      for (let i = 0; i < fps / 10; i++) envelope.update(0.01, 1 / fps)
      return envelope
    }
    const slow = sample(30),
      fast = sample(120)
    expect(slow.value).toBeCloseTo(fast.value, 8)
    slow.reset()
    expect(slow.value).toBe(0)
    expect(slow.update(NaN, 1 / 60)).toBe(0)
  })

  it('preserves distinct strengths, leaves headroom and retains a song range after seeking', () => {
    const envelope = new BassEnvelope()
    envelope.useTrack(1)
    for (let i = 0; i < 60; i++) {
      envelope.observe(0.2)
      envelope.update(0.2, 1 / 30)
    }
    const sample = (amplitude: number) => {
      envelope.reset()
      for (let i = 0; i < 60; i++) envelope.update(amplitude, 1 / 60)
      return envelope.value
    }
    const levels = [0, 0.005, 0.05, 0.1, 0.2, 0.4].map(sample)
    expect(levels[0]).toBe(0)
    expect(levels[1]).toBeLessThan(0.005)
    expect(levels.slice(1).every((value, index) => value > levels[index])).toBe(true)
    // Half-reference bass is visibly stronger, without losing peak headroom.
    expect(levels[3]).toBeGreaterThan(0.26)
    expect(levels[3]).toBeLessThan(0.28)
    expect(levels[4]).toBeCloseTo(0.61, 2)
    expect(levels[5]).toBeLessThan(0.95)
    envelope.useTrack(2)
    envelope.observe(0.001)
    expect(sample(0.001)).toBeLessThan(0.001)
    envelope.useTrack(1)
    expect(sample(0.2)).toBeCloseTo(levels[4], 6)
  })
})
