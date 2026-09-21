import { describe, expect, it } from 'vitest'
import { cdAlbumIndex, cdPose, cdSlots } from './cdGeometry'

describe('CD album geometry', () => {
  it('never exposes more than four albums or duplicates a small catalog', () => {
    for (const count of [0, 1, 2, 3, 4, 5, 10000]) {
      for (let step = -240; step <= 240; step++) {
        const slots = cdSlots(step / 40, count)
        expect(slots.length).toBeLessThanOrEqual(Math.min(4, count))
        const indexes = slots.map((index) => cdAlbumIndex(index, count))
        expect(new Set(indexes).size).toBe(indexes.length)
        for (const index of indexes) {
          expect(index).toBeGreaterThanOrEqual(0)
          expect(index).toBeLessThan(count)
        }
      }
    }
  })

  it('places two discs below-left and one above-right of the selected disc', () => {
    expect(cdSlots(0, 10)).toEqual([-2, -1, 0, 1])
    const poses = [-2, -1, 0, 1].map(cdPose)
    for (let index = 1; index < poses.length; index++) {
      expect(poses[index].x).toBeGreaterThan(poses[index - 1].x)
      expect(poses[index].y).toBeLessThan(poses[index - 1].y)
      expect(poses[index].size).toBeGreaterThan(poses[index - 1].size)
    }
  })
})
