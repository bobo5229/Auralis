import { describe, expect, it } from 'vitest'
import { SpectrumEnvelope } from './spectrumEnvelope'
import { SPECTRUM_BANDS } from '@shared/types/playbackSpectrum'

describe('spectrum display response', () => {
  it('opens quickly, releases gently and stays bounded', () => {
    const envelope = new SpectrumEnvelope()
    const loud = Array(SPECTRUM_BANDS).fill(1)
    expect(envelope.update(loud, 0.04)[0]).toBeGreaterThan(0.75)
    const peak = envelope.values[0]
    expect(envelope.update([], 0.04)[0]).toBeGreaterThan(peak * 0.7)
    for (let i = 0; i < 100; i++) envelope.update([], 0.04)
    expect(envelope.values[0]).toBeLessThan(0.001)
    expect(envelope.update([Infinity, NaN, -5, 4], 0.1)[3]).toBeLessThanOrEqual(1)
    envelope.reset()
    expect([...envelope.values].every((value) => value === 0)).toBe(true)
  })
})
