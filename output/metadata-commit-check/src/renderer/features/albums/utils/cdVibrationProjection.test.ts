import { describe, expect, it } from 'vitest'
import { cdVibrationProjection } from './cdVibrationProjection'

describe('disc normal projection', () => {
  it('moves towards the viewer with a small zoom when the disc is front-facing', () => {
    const p = cdVibrationProjection(0, 0, 0, 6, 1)
    expect(p.zoom).toBeGreaterThan(1)
    expect(p.x + 200 * p.zoom).toBeCloseTo(200)
    expect(p.y + 200 * p.zoom).toBeCloseTo(200)
  })
  it('follows the tilted normal, including an in-plane turn, and compensates pose scale', () => {
    const center = (x: number, y: number, z: number, scale: number) => {
      const p = cdVibrationProjection(x, y, z, 6, scale)
      return {
        x: ((p.x + 200 * (p.zoom - 1)) * scale) / p.zoom,
        y: ((p.y + 200 * (p.zoom - 1)) * scale) / p.zoom,
      }
    }
    const first = center(9, -42, 24, 1),
      large = center(9, -42, 24, 2),
      turn = center(9, -42, 204, 1)
    expect(first.x).toBeLessThan(0)
    expect(first.y).toBeLessThan(0)
    expect(large.x).toBeCloseTo(first.x)
    expect(large.y).toBeCloseTo(first.y)
    expect(turn.x).toBeCloseTo(-first.x)
    expect(turn.y).toBeCloseTo(-first.y)
  })
})
