import { describe, expect, it } from 'vitest'
import {
  PLAYBACK_CLOCK_EMPTY,
  formatPlaybackClock,
  formatPlaybackClockPair,
} from './formatPlaybackClock'

describe('formatPlaybackClock', () => {
  it('formats whole minutes and zero-padded seconds', () => {
    expect(formatPlaybackClock(0)).toBe('0:00')
    expect(formatPlaybackClock(84)).toBe('1:24')
    expect(formatPlaybackClock(211)).toBe('3:31')
  })

  it('floors fractional seconds', () => {
    expect(formatPlaybackClock(84.9)).toBe('1:24')
  })

  it('keeps minutes above 59 instead of rolling into hours', () => {
    expect(formatPlaybackClock(70 * 60 + 5)).toBe('70:05')
  })

  it('returns the empty glyph for missing or invalid values', () => {
    expect(formatPlaybackClock(null)).toBe(PLAYBACK_CLOCK_EMPTY)
    expect(formatPlaybackClock(undefined)).toBe(PLAYBACK_CLOCK_EMPTY)
    expect(formatPlaybackClock(Number.NaN)).toBe(PLAYBACK_CLOCK_EMPTY)
    expect(formatPlaybackClock(-1)).toBe(PLAYBACK_CLOCK_EMPTY)
  })
})

describe('formatPlaybackClockPair', () => {
  it('uses empty glyphs when no track is loaded', () => {
    expect(formatPlaybackClockPair(12, 180, false)).toBe('--:-- / --:--')
  })

  it('joins elapsed and duration with a slash', () => {
    expect(formatPlaybackClockPair(84, 211, true)).toBe('1:24 / 3:31')
  })

  it('keeps an empty duration glyph when length is unknown', () => {
    expect(formatPlaybackClockPair(12, 0, true)).toBe('0:12 / --:--')
  })
})
