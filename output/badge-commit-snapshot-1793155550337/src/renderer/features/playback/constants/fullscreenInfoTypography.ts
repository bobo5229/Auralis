export const FULLSCREEN_INFO_TYPOGRAPHY_STORAGE_KEY = 'auralis-fullscreen-info-typography'
export const FULLSCREEN_INFO_TYPOGRAPHY_VERSION = 1
export const FULLSCREEN_INFO_TYPOGRAPHY_DIAGNOSTIC_SCOPE = 'playback.fullscreen-info-typography'

export const FULLSCREEN_INFO_FONT_WEIGHTS = [400, 500, 600, 700, 800] as const
export type FullscreenInfoFontWeight = (typeof FULLSCREEN_INFO_FONT_WEIGHTS)[number]

export interface FullscreenInfoTypography {
  titleFontSizePx: number
  titleFontWeight: FullscreenInfoFontWeight
  subtitleFontSizePx: number
  subtitleFontWeight: FullscreenInfoFontWeight
}

// Defaults are the previous clamp ceilings, so a wide fullscreen window keeps the same size.
export const FULLSCREEN_INFO_TYPOGRAPHY_DEFAULTS: Readonly<FullscreenInfoTypography> = {
  titleFontSizePx: 25,
  titleFontWeight: 800,
  subtitleFontSizePx: 19,
  subtitleFontWeight: 700,
}

export const FULLSCREEN_INFO_TYPOGRAPHY_RANGES = {
  titleFontSizePx: { min: 14, max: 40, step: 1 },
  subtitleFontSizePx: { min: 12, max: 32, step: 1 },
} as const

export const FULLSCREEN_INFO_TYPOGRAPHY_FIELDS = [
  'titleFontSizePx',
  'titleFontWeight',
  'subtitleFontSizePx',
  'subtitleFontWeight',
] as const satisfies readonly (keyof FullscreenInfoTypography)[]

export interface FullscreenInfoTypographyParseResult {
  preference: FullscreenInfoTypography
  retainStorage: boolean
  issues: readonly string[]
}

export type FullscreenInfoTypographyStyle = Record<
  | '--fullscreen-info-title-font-size'
  | '--fullscreen-info-title-font-weight'
  | '--fullscreen-info-subtitle-font-size'
  | '--fullscreen-info-subtitle-font-weight',
  string
>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFontSizePx(
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

export function isFullscreenInfoFontWeight(value: unknown): value is FullscreenInfoFontWeight {
  return FULLSCREEN_INFO_FONT_WEIGHTS.some((weight) => weight === value)
}

export function isFullscreenInfoTypographyFieldValue(
  field: keyof FullscreenInfoTypography,
  value: unknown,
): boolean {
  if (field === 'titleFontWeight' || field === 'subtitleFontWeight') {
    return isFullscreenInfoFontWeight(value)
  }
  return isFontSizePx(value, FULLSCREEN_INFO_TYPOGRAPHY_RANGES[field])
}

export function fullscreenInfoTypographyCssVars(
  preference: FullscreenInfoTypography,
): FullscreenInfoTypographyStyle {
  return {
    '--fullscreen-info-title-font-size': `${preference.titleFontSizePx}px`,
    '--fullscreen-info-title-font-weight': String(preference.titleFontWeight),
    '--fullscreen-info-subtitle-font-size': `${preference.subtitleFontSizePx}px`,
    '--fullscreen-info-subtitle-font-weight': String(preference.subtitleFontWeight),
  }
}

export function serializeFullscreenInfoTypography(preference: FullscreenInfoTypography): string {
  return JSON.stringify({ version: FULLSCREEN_INFO_TYPOGRAPHY_VERSION, ...preference })
}

function unusable(issue: string): FullscreenInfoTypographyParseResult {
  return {
    preference: { ...FULLSCREEN_INFO_TYPOGRAPHY_DEFAULTS },
    retainStorage: true,
    issues: [issue],
  }
}

export function parseStoredFullscreenInfoTypography(
  raw: string | null,
): FullscreenInfoTypographyParseResult {
  if (raw === null || raw === '') {
    return {
      preference: { ...FULLSCREEN_INFO_TYPOGRAPHY_DEFAULTS },
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
  if (parsed.version !== FULLSCREEN_INFO_TYPOGRAPHY_VERSION) return unusable('unsupported-version')

  const preference = { ...FULLSCREEN_INFO_TYPOGRAPHY_DEFAULTS }
  const issues: string[] = []
  for (const field of FULLSCREEN_INFO_TYPOGRAPHY_FIELDS) {
    const value = parsed[field]
    if (value === undefined) continue
    if (field === 'titleFontWeight' || field === 'subtitleFontWeight') {
      if (isFullscreenInfoFontWeight(value)) preference[field] = value
      else issues.push(`${field}:invalid`)
      continue
    }
    if (isFontSizePx(value, FULLSCREEN_INFO_TYPOGRAPHY_RANGES[field])) preference[field] = value
    else issues.push(`${field}:invalid`)
  }

  return { preference, retainStorage: false, issues }
}
