import { describe, expect, it } from 'vitest'
import { formatArchiveMinutes, resolveArchiveDailyDetailView } from './archiveDailyDetailState'

describe('resolveArchiveDailyDetailView', () => {
  it('keeps loading ahead of stale errors and tracks', () => {
    expect(resolveArchiveDailyDetailView(true, 'stale', 4)).toBe('loading')
  })

  it('shows an error once loading finishes', () => {
    expect(resolveArchiveDailyDetailView(false, 'failed', 4)).toBe('error')
  })

  it('distinguishes populated and empty details', () => {
    expect(resolveArchiveDailyDetailView(false, null, 2)).toBe('tracks')
    expect(resolveArchiveDailyDetailView(false, null, 0)).toBe('empty')
  })
})

describe('formatArchiveMinutes', () => {
  it('preserves the sub-minute label and minute rounding contract', () => {
    expect(formatArchiveMinutes(0)).toBe('0 分钟')
    expect(formatArchiveMinutes(32)).toBe('不到 1 分钟')
    expect(formatArchiveMinutes(60)).toBe('1 分钟')
    expect(formatArchiveMinutes(95)).toBe('2 分钟')
  })
})
