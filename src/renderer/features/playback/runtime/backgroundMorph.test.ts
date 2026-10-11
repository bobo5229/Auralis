import { describe, expect, it } from 'vitest'
import { backgroundMorphPresentation, createBackgroundMorphClock } from './backgroundMorph'

describe('fullscreen material clock', () => {
  it('completes both directions in 950 ms with smooth endpoints', () => {
    const clock = createBackgroundMorphClock(0)
    clock.to(1, 100, true)
    expect(clock.sample(100)).toBe(0)
    expect(clock.sample(575)).toBeCloseTo(0.5)
    expect(clock.sample(1049)).toBeLessThan(1)
    expect(clock.sample(1050)).toBe(1)
    expect(clock.transitioning).toBe(false)
    clock.to(0, 1050, true)
    expect(clock.sample(1525)).toBeCloseTo(0.5)
    expect(clock.sample(2000)).toBe(0)
  })
  it('reverses from the sampled material, shortening the remaining distance', () => {
    const clock = createBackgroundMorphClock(0)
    clock.to(1, 0, true)
    const halfway = clock.sample(475)
    clock.to(0, 475, true)
    expect(clock.phase).toBe(halfway)
    expect(clock.sample(712.5)).toBeCloseTo(0.25)
    expect(clock.sample(950)).toBe(0)
  })
  it('does not restart repeated targets and can settle without replaying hidden time', () => {
    const clock = createBackgroundMorphClock(0)
    clock.to(1, 0, true)
    clock.to(1, 200, true)
    expect(clock.sample(950)).toBe(1)
    clock.to(0, 1000, true)
    clock.finish()
    expect(clock.sample(100_000)).toBe(0)
    expect(clock.transitioning).toBe(false)
    clock.to(1, 100_001, false)
    expect(clock.phase).toBe(1)
  })
  it('keeps the native flow treatment at zero and removes it entirely at metal', () => {
    expect(backgroundMorphPresentation(0)).toEqual({ feather: 12, scale: 1.08, effects: 1 })
    expect(backgroundMorphPresentation(1)).toEqual({ feather: 0, scale: 1, effects: 0 })
    expect(backgroundMorphPresentation(0.5).feather).toBeGreaterThan(0)
    expect(backgroundMorphPresentation(0.5).effects).toBeLessThan(1)
  })
})
