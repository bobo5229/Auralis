import { describe, expect, it } from 'vitest'
import { formatBitrate } from './formatBitrate'

describe('formatBitrate', () => {
  it.each([
    [320000, '320 K'],
    [1411200, '1411 K'],
    [256789.5, '257 K'],
  ])('formats %s as %s', (input, expected) => expect(formatBitrate(input as number)).toBe(expected))
  it.each([null, undefined, 0, -1, NaN, Infinity, -Infinity])(
    'reserves a placeholder for %s',
    (input) => expect(formatBitrate(input)).toBe('—'),
  )
})
