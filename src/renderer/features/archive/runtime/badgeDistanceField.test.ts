import { describe, expect, it } from 'vitest'
import { signedDistance } from './badgeDistanceField'

describe('badge signed distance', () => {
  it.each([1, 1.5])(
    'matches a brute-force distance field including edge coverage at scale %s',
    (scale) => {
      const width = 9,
        height = 7
      const alpha = Uint8Array.from({ length: width * height }, (_, i) => {
        const x = i % width,
          y = Math.floor(i / width)
        return x >= 2 && x <= 6 && y >= 2 && y <= 4 ? (x === 2 ? 128 : 255) : 0
      })
      const actual = signedDistance(alpha, width, height, scale)
      const expected = new Float32Array(alpha.length)
      for (let i = 0; i < alpha.length; i++) {
        let outer = 1e20,
          inner = 1e20
        for (let j = 0; j < alpha.length; j++) {
          const coverage = alpha[j] / 255
          const squared =
            ((i % width) - (j % width)) ** 2 + (Math.floor(i / width) - Math.floor(j / width)) ** 2
          outer = Math.min(
            outer,
            squared + (coverage === 0 ? 1e20 : Math.max(0, 0.5 - coverage) ** 2),
          )
          inner = Math.min(
            inner,
            squared + (coverage === 1 ? 1e20 : Math.max(0, coverage - 0.5) ** 2),
          )
        }
        expected[i] = (Math.sqrt(outer) - Math.sqrt(inner)) / scale
      }
      expect(actual).toEqual(expected)
    },
  )
})
