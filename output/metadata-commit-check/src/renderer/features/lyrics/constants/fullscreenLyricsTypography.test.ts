import { describe, expect, it } from 'vitest'
import {
  FULLSCREEN_LYRICS_TYPOGRAPHY_DEFAULTS,
  FULLSCREEN_LYRICS_TYPOGRAPHY_STORAGE_KEY,
  fullscreenLyricsTypographyCssVars,
  parseStoredFullscreenLyricsTypography,
  serializeFullscreenLyricsTypography,
} from './fullscreenLyricsTypography'

describe('fullscreen lyrics typography constants', () => {
  it('uses the adaptive defaults and maps them to CSS ratios', () => {
    expect(FULLSCREEN_LYRICS_TYPOGRAPHY_DEFAULTS).toEqual({
      fontSizePercent: 100,
      fontWeight: 800,
      lineGapPercent: 100,
    })
    expect(fullscreenLyricsTypographyCssVars(FULLSCREEN_LYRICS_TYPOGRAPHY_DEFAULTS)).toEqual({
      '--fullscreen-lyrics-font-scale': '1',
      '--fullscreen-lyrics-font-weight': '800',
      '--fullscreen-lyrics-gap-scale': '1',
    })
    expect(FULLSCREEN_LYRICS_TYPOGRAPHY_STORAGE_KEY).toBe('auralis-fullscreen-lyrics-typography')
  })

  it.each([null, '', '{', '[]', 'null', '"value"', '{"version":2}'])(
    'falls back to defaults for unusable storage %s',
    (raw) => {
      expect(parseStoredFullscreenLyricsTypography(raw)).toMatchObject({
        preference: FULLSCREEN_LYRICS_TYPOGRAPHY_DEFAULTS,
      })
    },
  )

  it('keeps legal fields from a partial payload and defaults only invalid fields', () => {
    const parsed = parseStoredFullscreenLyricsTypography(
      JSON.stringify({
        version: 1,
        fontSizePercent: 125,
        fontWeight: '700',
        lineGapPercent: 55,
        futureField: true,
      }),
    )

    expect(parsed.preference).toEqual({ fontSizePercent: 125, fontWeight: 800, lineGapPercent: 55 })
    expect(parsed.retainStorage).toBe(false)
    expect(parsed.issues).toEqual(['fontWeight:invalid'])
  })

  it.each([74, 76, 151, 100.5, '100', true])('rejects invalid percentage value %s', (value) => {
    const parsed = parseStoredFullscreenLyricsTypography(
      JSON.stringify({ version: 1, fontSizePercent: value }),
    )
    expect(parsed.preference.fontSizePercent).toBe(100)
    expect(parsed.issues).toContain('fontSizePercent:invalid')
  })

  it('round-trips a valid full preference', () => {
    const preference = { fontSizePercent: 150, fontWeight: 400 as const, lineGapPercent: 50 }
    const serialized = serializeFullscreenLyricsTypography(preference)
    expect(JSON.parse(serialized)).toEqual({ version: 1, ...preference })
    expect(parseStoredFullscreenLyricsTypography(serialized).preference).toEqual(preference)
  })
})
