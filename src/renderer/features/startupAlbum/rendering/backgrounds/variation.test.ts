import { describe, expect, it, vi } from 'vitest'
import { createBackgroundVariation } from './variation'

describe('seeded card background geometry', () => {
  it('replays all seven patterns without reading global randomness', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Drawing must not choose a fresh seed')
    })
    try {
      expect(createBackgroundVariation(0x12345678)).toEqual(createBackgroundVariation(0x12345678))
      expect(random).not.toHaveBeenCalled()
    } finally {
      random.mockRestore()
    }
  })

  it('changes geometry in each style for different seeds', () => {
    const first = createBackgroundVariation(0x12345678)
    const second = createBackgroundVariation(0x87654321)
    for (const style of Object.keys(first) as (keyof typeof first)[]) {
      expect(first[style]).not.toEqual(second[style])
    }
  })

  it('keeps paper layers and terrain contours ordered across many seeds', () => {
    for (let seed = 0; seed < 256; seed++) {
      const { paper, terrain, tunnel } = createBackgroundVariation(Math.imul(seed, 0x9e3779b9))
      // The largest displacement between adjacent paper waves must stay below
      // their spacing; nested terrain shares one contour and shrinks uniformly.
      expect(2 * paper.amplitude * Math.sin(paper.layerPhase / 2)).toBeLessThan(paper.spacing)
      expect(terrain.radius - 6 * terrain.spacing).toBeGreaterThan(0)
      expect(terrain.relief + terrain.detail).toBeLessThan(1)
      expect(tunnel.spacing).toBeGreaterThan(0)
    }
  })
})
