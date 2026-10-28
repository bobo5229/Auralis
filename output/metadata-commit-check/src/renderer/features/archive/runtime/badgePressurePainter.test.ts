import { describe, expect, it } from 'vitest'
import { createPressurePainter, type PressureConfiguration } from './badgePressurePainter'

function configuration(): PressureConfiguration {
  return {
    width: 32,
    height: 20,
    scale: 1,
    base: Uint8ClampedArray.from({ length: 32 * 20 * 4 }, (_, i) =>
      i % 4 === 3 ? 255 : 25 + (i % 27),
    ),
    fields: [2, 6, 24].map((x) => ({
      x,
      y: 4,
      width: 6,
      height: 8,
      envelope: new Float32Array(48).fill(0.7),
      gx: new Float32Array(48).fill(0.12),
      gy: new Float32Array(48).fill(-0.09),
      pressure: 1,
    })),
  }
}

describe('badge pressure cache', () => {
  it('does no work once all pressure values are painted', () => {
    const painter = createPressurePainter(configuration())
    expect(painter.paint([1, 1, 1])).not.toBeNull()
    expect(painter.paint([1, 1, 1])).toBeNull()
  })
  it('repaints a changed region and matches a fresh composition through reversals', () => {
    const config = configuration(),
      painter = createPressurePainter(config)
    const pixels = new Uint8ClampedArray(config.base)
    for (const pressures of [
      [1, 1, 1],
      [0.82, 1, 1],
      [0.82, 0.9, 1],
      [0.96, 0.82, 1],
      [1, 1, 1],
    ]) {
      const patch = painter.paint(pressures)!
      for (let y = 0; y < patch.height; y++)
        pixels.set(
          patch.pixels.subarray(y * patch.width * 4, (y + 1) * patch.width * 4),
          ((patch.top + y) * config.width + patch.left) * 4,
        )
      const fresh = configuration()
      const full = createPressurePainter(fresh).paint(pressures)!
      for (let y = 0; y < full.height; y++)
        expect(
          pixels.subarray(
            ((full.top + y) * config.width + full.left) * 4,
            ((full.top + y) * config.width + full.left + full.width) * 4,
          ),
        ).toEqual(full.pixels.subarray(y * full.width * 4, (y + 1) * full.width * 4))
    }
    const local = painter.paint([0.82, 1, 1])!
    expect(local.width * local.height).toBeLessThan((config.width * config.height) / 2)
  })
})
