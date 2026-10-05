import { describe, expect, it } from 'vitest'
import { formatArchiveMinutes } from './archiveDailyDetailState'

describe('formatArchiveMinutes', () => {
  it('preserves the sub-minute label and minute rounding contract', () => {
    expect(formatArchiveMinutes(0)).toBe('0 分钟')
    expect(formatArchiveMinutes(32)).toBe('不到 1 分钟')
    expect(formatArchiveMinutes(60)).toBe('1 分钟')
    expect(formatArchiveMinutes(95)).toBe('2 分钟')
  })
})
