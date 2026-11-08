import { describe, expect, it } from 'vitest'
import { formatSummaryMonth } from './formatSummaryMonth'

describe('annual summary month formatting', () => {
  it.each([
    [1, 'January', 'Jan'],
    [12, 'December', 'Dec'],
  ] as const)('formats month %i in English', (month, full, short) => {
    expect(formatSummaryMonth(month, 'en')).toBe(full)
    expect(formatSummaryMonth(month, 'en', 'short')).toBe(short)
  })
  it('retains numeric Chinese month tokens for translated templates', () => {
    expect(formatSummaryMonth(1, 'zh-Hans')).toBe('1')
    expect(formatSummaryMonth(12, 'zh-Hans', 'short')).toBe('12')
  })
})
