import { describe, expect, it } from 'vitest'
import {
  assertRecentFrequentDays,
  DEFAULT_RECENT_FREQUENT_DAYS,
  RECENT_FREQUENT_DAY_OPTIONS,
  resolveRecentFrequentDateRange,
} from './recentFrequent'

describe('recent frequent date ranges', () => {
  it('provides built-in options and includes today in a custom rolling range', () => {
    expect(RECENT_FREQUENT_DAY_OPTIONS).toEqual([3, 7, 30, 90, 365])
    expect(DEFAULT_RECENT_FREQUENT_DAYS).toBe(30)
    const now = new Date(2026, 9, 2, 23, 59)
    expect(resolveRecentFrequentDateRange(3, now)).toEqual({
      startDate: '2026-09-30',
      endDate: '2026-10-02',
    })
    expect(resolveRecentFrequentDateRange(12, now).startDate).toBe('2026-09-21')
    expect(resolveRecentFrequentDateRange(1, now).startDate).toBe('2026-10-02')
    expect(resolveRecentFrequentDateRange(30, now).startDate).toBe('2026-09-03')
  })

  it('handles leap days, year rollover and very large custom ranges', () => {
    expect(resolveRecentFrequentDateRange(3, new Date(2026, 2, 9)).startDate).toBe('2026-03-07')
    expect(resolveRecentFrequentDateRange(3, new Date(2026, 10, 2)).startDate).toBe('2026-10-31')
    expect(resolveRecentFrequentDateRange(3, new Date(2024, 2, 1)).startDate).toBe('2024-02-28')
    expect(resolveRecentFrequentDateRange(7, new Date(2026, 0, 2)).startDate).toBe('2025-12-27')
    expect(resolveRecentFrequentDateRange(Number.MAX_SAFE_INTEGER, new Date(2026, 9, 2))).toEqual({
      startDate: '0001-01-01',
      endDate: '2026-10-02',
    })
  })

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '7', null])(
    'rejects invalid days: %s',
    (value) => {
      expect(() => assertRecentFrequentDays(value as number)).toThrow(/正整数/)
    },
  )
})
