import { describe, expect, it } from 'vitest'
import { latestActiveDay } from './latestActiveDay'

describe('latest active archive day', () => {
  it('returns the newest date with effective plays', () => {
    expect(
      latestActiveDay([
        { date: '2026-01-02', playCount: 0, durationSeconds: 0 },
        { date: '2026-10-09', playCount: 2, durationSeconds: 600 },
        { date: '2026-03-01', playCount: 5, durationSeconds: 900 },
      ]),
    ).toBe('2026-10-09')
  })

  it('returns null for an empty or silent year', () => {
    expect(latestActiveDay([])).toBeNull()
    expect(latestActiveDay([{ date: '2026-05-01', playCount: 0, durationSeconds: 0 }])).toBeNull()
  })
})
