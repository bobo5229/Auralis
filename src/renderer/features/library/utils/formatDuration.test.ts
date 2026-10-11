import { describe, expect, it } from 'vitest'
import { formatDuration } from './formatDuration'

describe('formatDuration', () => {
  it.each([
    [0, '00:00'],
    [9, '00:09'],
    [60, '01:00'],
    [272, '04:32'],
    [3599.9, '59:59'],
    [3600, '01:00:00'],
    [3661, '01:01:01'],
    [360000, '100:00:00'],
  ])('formats %s seconds as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected)
  })

  it.each([null, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'keeps unavailable duration %s empty',
    (seconds) => {
      expect(formatDuration(seconds)).toBe('')
    },
  )
})
