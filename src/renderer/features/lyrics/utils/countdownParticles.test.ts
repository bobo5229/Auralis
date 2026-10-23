import { expect, it } from 'vitest'
import { createCountdownParticles, getCountdownFractureProgress } from './countdownParticles'

it('breaks dots sequentially and finishes the last dot when lyrics start', () => {
  const at = (time: number) => [0, 1, 2].map((index) => getCountdownFractureProgress(time, index))
  expect(at(0)).toEqual([0, 0, 0])
  expect(at(1)).toEqual([1, 0, 0])
  expect(at(2)).toEqual([1, 1, 0])
  expect(at(3)).toEqual([1, 1, 1])
  expect(at(0.775)[0]).toBeCloseTo(0.5)
  // Seeking backwards or starting a new track reconstructs intact dots.
  expect(at(-1)).toEqual([0, 0, 0])
  expect(at(NaN)).toEqual([0, 0, 0])
})

it('generates repeatable fine grains within the source circle', () => {
  const grains = createCountdownParticles(1)
  expect(grains.length).toBeGreaterThan(80)
  expect(grains).toEqual(createCountdownParticles(1))
  expect(grains).not.toEqual(createCountdownParticles(2))
  for (const grain of grains) {
    expect(Math.hypot(grain.x - 6, grain.y - 6)).toBeLessThanOrEqual(5.6)
    expect(grain.radius).toBeLessThan(0.5)
    expect(Number.isFinite(grain.dx + grain.dy)).toBe(true)
  }
})
