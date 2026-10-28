export const FULLSCREEN_LYRICS_TYPOGRAPHY_STORAGE_KEY = 'auralis-fullscreen-lyrics-typography'
export const FULLSCREEN_LYRICS_TYPOGRAPHY_VERSION = 1
export const FULLSCREEN_LYRICS_TYPOGRAPHY_DIAGNOSTIC_SCOPE = 'lyrics.fullscreen-typography'

export const FULLSCREEN_LYRIC_FONT_WEIGHTS = [400, 500, 600, 700, 800] as const
export type FullscreenLyricFontWeight = (typeof FULLSCREEN_LYRIC_FONT_WEIGHTS)[number]

export interface FullscreenLyricsTypography {
  fontSizePercent: number
  fontWeight: FullscreenLyricFontWeight
  lineGapPercent: number
}

export const FULLSCREEN_LYRICS_TYPOGRAPHY_DEFAULTS: Readonly<FullscreenLyricsTypography> = {
  fontSizePercent: 100,
  fontWeight: 800,
  lineGapPercent: 100,
}

export const FULLSCREEN_LYRICS_TYPOGRAPHY_RANGES = {
  fontSizePercent: { min: 75, max: 150, step: 5 },
  lineGapPercent: { min: 50, max: 150, step: 5 },
} as const

export interface FullscreenLyricsTypographyParseResult {
  preference: FullscreenLyricsTypography
  retainStorage: boolean
  issues: readonly string[]
}

export type FullscreenLyricsTypographyStyle = Record<
  | '--fullscreen-lyrics-font-scale'
  | '--fullscreen-lyrics-font-weight'
  | '--fullscreen-lyrics-gap-scale',
  string
>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPercentInRange(
  value: unknown,
  range: { min: number; max: number; step: number },
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= range.min &&
    value <= range.max &&
    (value - range.min) % range.step === 0
  )
}

export function isFullscreenLyricFontWeight(value: unknown): value is FullscreenLyricFontWeight {
  return FULLSCREEN_LYRIC_FONT_WEIGHTS.some((weight) => weight === value)
}

export function isFullscreenLyricsTypographyFieldValue(
  field: keyof FullscreenLyricsTypography,
  value: unknown,
): boolean {
  if (field === 'fontWeight') return isFullscreenLyricFontWeight(value)
  if (field === 'fontSizePercent')
    return isPercentInRange(value, FULLSCREEN_LYRICS_TYPOGRAPHY_RANGES.fontSizePercent)
  return isPercentInRange(value, FULLSCREEN_LYRICS_TYPOGRAPHY_RANGES.lineGapPercent)
}

export function fullscreenLyricsTypographyCssVars(
  preference: FullscreenLyricsTypography,
): FullscreenLyricsTypographyStyle {
  return {
    '--fullscreen-lyrics-font-scale': String(preference.fontSizePercent / 100),
    '--fullscreen-lyrics-font-weight': String(preference.fontWeight),
    '--fullscreen-lyrics-gap-scale': String(preference.lineGapPercent / 100),
  }
}

export function serializeFullscreenLyricsTypography(
  preference: FullscreenLyricsTypography,
): string {
  return JSON.stringify({ version: FULLSCREEN_LYRICS_TYPOGRAPHY_VERSION, ...preference })
}

function unusable(issue: string): FullscreenLyricsTypographyParseResult {
  return {
    preference: { ...FULLSCREEN_LYRICS_TYPOGRAPHY_DEFAULTS },
    retainStorage: true,
    issues: [issue],
  }
}

export function parseStoredFullscreenLyricsTypography(
  raw: string | null,
): FullscreenLyricsTypographyParseResult {
  if (raw === null || raw === '') {
    return {
      preference: { ...FULLSCREEN_LYRICS_TYPOGRAPHY_DEFAULTS },
      retainStorage: false,
      issues: [],
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return unusable('invalid-json')
  }

  if (!isRecord(parsed)) return unusable('invalid-shape')
  if (parsed.version !== FULLSCREEN_LYRICS_TYPOGRAPHY_VERSION)
    return unusable('unsupported-version')

  const preference = { ...FULLSCREEN_LYRICS_TYPOGRAPHY_DEFAULTS }
  const issues: string[] = []
  for (const field of ['fontSizePercent', 'fontWeight', 'lineGapPercent'] as const) {
    const value = parsed[field]
    if (value === undefined) continue
    if (field === 'fontSizePercent') {
      if (isPercentInRange(value, FULLSCREEN_LYRICS_TYPOGRAPHY_RANGES.fontSizePercent))
        preference.fontSizePercent = value
      else issues.push(`${field}:invalid`)
    } else if (field === 'fontWeight') {
      if (isFullscreenLyricFontWeight(value)) preference.fontWeight = value
      else issues.push(`${field}:invalid`)
    } else if (isPercentInRange(value, FULLSCREEN_LYRICS_TYPOGRAPHY_RANGES.lineGapPercent)) {
      preference.lineGapPercent = value
    } else issues.push(`${field}:invalid`)
  }

  return { preference, retainStorage: false, issues }
}
