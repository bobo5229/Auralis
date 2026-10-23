import { describe, expect, it } from 'vitest'
import {
  FULLSCREEN_INFO_TYPOGRAPHY_DEFAULTS,
  FULLSCREEN_INFO_TYPOGRAPHY_RANGES,
  FULLSCREEN_INFO_TYPOGRAPHY_STORAGE_KEY,
  fullscreenInfoTypographyCssVars,
  parseStoredFullscreenInfoTypography,
  serializeFullscreenInfoTypography,
} from './fullscreenInfoTypography'

describe('fullscreen info typography constants', () => {
  it('uses fixed pixel defaults for the title and subtitle', () => {
    expect(FULLSCREEN_INFO_TYPOGRAPHY_DEFAULTS).toEqual({
      titleFontSizePx: 25,
      titleFontWeight: 800,
      subtitleFontSizePx: 19,
      subtitleFontWeight: 700,
    })
    expect(FULLSCREEN_INFO_TYPOGRAPHY_RANGES).toEqual({
      titleFontSizePx: { min: 14, max: 40, step: 1 },
      subtitleFontSizePx: { min: 12, max: 32, step: 1 },
    })
    expect(fullscreenInfoTypographyCssVars(FULLSCREEN_INFO_TYPOGRAPHY_DEFAULTS)).toEqual({
      '--fullscreen-info-title-font-size': '25px',
      '--fullscreen-info-title-font-weight': '800',
      '--fullscreen-info-subtitle-font-size': '19px',
      '--fullscreen-info-subtitle-font-weight': '700',
    })
    expect(FULLSCREEN_INFO_TYPOGRAPHY_STORAGE_KEY).toBe('auralis-fullscreen-info-typography')
  })

  it.each([null, '', '{', '[]', 'null', '"value"', '{"version":2}'])(
    'falls back to defaults for unusable storage %s',
    (raw) => {
      expect(parseStoredFullscreenInfoTypography(raw)).toMatchObject({
        preference: FULLSCREEN_INFO_TYPOGRAPHY_DEFAULTS,
        retainStorage: raw !== null && raw !== '',
      })
    },
  )

  it('keeps legal fields from a partial payload and defaults only invalid fields', () => {
    const parsed = parseStoredFullscreenInfoTypography(
      JSON.stringify({
        version: 1,
        titleFontSizePx: 32,
        titleFontWeight: '700',
        subtitleFontSizePx: 14,
        subtitleFontWeight: 900,
        futureField: true,
      }),
    )

    expect(parsed.preference).toEqual({
      titleFontSizePx: 32,
      titleFontWeight: 800,
      subtitleFontSizePx: 14,
      subtitleFontWeight: 700,
    })
    expect(parsed.retainStorage).toBe(false)
    expect(parsed.issues).toEqual(['titleFontWeight:invalid', 'subtitleFontWeight:invalid'])
  })

  it('ignores previously stored percentage sizes and keeps saved weights', () => {
    const parsed = parseStoredFullscreenInfoTypography(
      JSON.stringify({
        version: 1,
        titleFontSizePercent: 125,
        subtitleFontSizePercent: 80,
        titleFontWeight: 600,
      }),
    )

    expect(parsed.preference).toEqual({
      titleFontSizePx: 25,
      titleFontWeight: 600,
      subtitleFontSizePx: 19,
      subtitleFontWeight: 700,
    })
    expect(parsed.issues).toEqual([])
  })

  it.each([13, 41, 25.5, '25', true])(
    'rejects invalid title size %s without changing the subtitle',
    (value) => {
      const parsed = parseStoredFullscreenInfoTypography(
        JSON.stringify({ version: 1, titleFontSizePx: value, subtitleFontWeight: 500 }),
      )
      expect(parsed.preference.titleFontSizePx).toBe(25)
      expect(parsed.preference.subtitleFontWeight).toBe(500)
      expect(parsed.issues).toContain('titleFontSizePx:invalid')
    },
  )

  it('round-trips a valid full preference', () => {
    const preference = {
      titleFontSizePx: 40,
      titleFontWeight: 400 as const,
      subtitleFontSizePx: 12,
      subtitleFontWeight: 600 as const,
    }
    const serialized = serializeFullscreenInfoTypography(preference)
    expect(JSON.parse(serialized)).toEqual({ version: 1, ...preference })
    expect(parseStoredFullscreenInfoTypography(serialized).preference).toEqual(preference)
    expect(fullscreenInfoTypographyCssVars(preference)).toEqual({
      '--fullscreen-info-title-font-size': '40px',
      '--fullscreen-info-title-font-weight': '400',
      '--fullscreen-info-subtitle-font-size': '12px',
      '--fullscreen-info-subtitle-font-weight': '600',
    })
  })
})
