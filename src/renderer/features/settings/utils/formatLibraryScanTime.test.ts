import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatLibraryScanTime } from './formatLibraryScanTime'

afterEach(() => vi.unstubAllEnvs())

describe('formatLibraryScanTime', () => {
  it.each([
    ['Asia/Shanghai', '11/10/2026, 17:42'],
    ['America/Los_Angeles', '11/10/2026, 02:42'],
    ['UTC', '11/10/2026, 09:42'],
  ])('displays SQLite UTC timestamps in the computer timezone %s', (zone, expected) => {
    vi.stubEnv('TZ', zone)
    expect(formatLibraryScanTime('2026-10-11 09:42:00', 'en-GB')).toBe(expected)
  })

  it('converts the calendar date when the local timezone crosses midnight', () => {
    vi.stubEnv('TZ', 'Asia/Shanghai')
    expect(formatLibraryScanTime('2026-10-11 20:42:00', 'en-GB')).toBe('12/10/2026, 04:42')
  })

  it('uses the computer timezone rather than the UI language', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles')
    expect(formatLibraryScanTime('2026-10-11 09:42:00', 'zh-CN')).toBe('2026/10/11 02:42')
  })

  it.each(['2026-10-11T09:42:00Z', '2026-10-11T17:42:00+08:00', '2026-10-11 09:42:00.123'])(
    'preserves explicit offsets and accepts fractional SQLite timestamps: %s',
    (value) => {
      vi.stubEnv('TZ', 'Asia/Shanghai')
      expect(formatLibraryScanTime(value, 'en-GB')).toBe('11/10/2026, 17:42')
    },
  )

  it('keeps an unparseable timestamp as the existing fallback', () => {
    expect(formatLibraryScanTime('invalid', 'en-GB')).toBe('invalid')
  })
})
