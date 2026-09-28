export const SONG_FONT_WEIGHT_STORAGE_KEY = 'auralis-song-font-weights'
export const SONG_FONT_WEIGHT_VERSION = 1
export const SONG_FONT_WEIGHT_DIAGNOSTIC_SCOPE = 'appearance.song-font-weight'

export const SONG_FONT_WEIGHT_OPTIONS = [400, 500, 600, 700] as const
export type SongFontWeightValue = (typeof SONG_FONT_WEIGHT_OPTIONS)[number]
export type SongFontWeightChoice = 'default' | SongFontWeightValue

export const SONG_LIST_FONT_FIELDS = ['title', 'artist', 'album', 'duration'] as const
export const SONG_COVER_FONT_FIELDS = [
  'title',
  'artist',
  'album',
  'albumArtist',
  'releaseDate',
  'trackNumber',
  'genre',
  'duration',
  'discHeading',
] as const

export type SongListFontField = (typeof SONG_LIST_FONT_FIELDS)[number]
export type SongCoverFontField = (typeof SONG_COVER_FONT_FIELDS)[number]
export type SongFontWeightView = 'list' | 'cover'

export interface SongFontWeightPreference {
  list: Partial<Record<SongListFontField, SongFontWeightValue>>
  cover: Partial<Record<SongCoverFontField, SongFontWeightValue>>
}

export interface SongFontWeightParseResult {
  preference: SongFontWeightPreference
  retainStorage: boolean
  issues: readonly string[]
}

export const SONG_FONT_WEIGHT_DEFAULTS = {
  list: {
    title: 700,
    artist: 600,
    album: 600,
    duration: 400,
  },
  cover: {
    title: 500,
    artist: 400,
    album: 700,
    albumArtist: 600,
    releaseDate: 500,
    trackNumber: 400,
    genre: 400,
    duration: 400,
    discHeading: 700,
  },
} as const satisfies {
  list: Record<SongListFontField, SongFontWeightValue>
  cover: Record<SongCoverFontField, SongFontWeightValue>
}

const FIELD_SLUG = {
  title: 'title',
  artist: 'artist',
  album: 'album',
  albumArtist: 'album-artist',
  releaseDate: 'release-date',
  trackNumber: 'track-number',
  genre: 'genre',
  duration: 'duration',
  discHeading: 'disc-heading',
} as const satisfies Record<SongCoverFontField, string>

const listFields: ReadonlySet<string> = new Set(SONG_LIST_FONT_FIELDS)
const coverFields: ReadonlySet<string> = new Set(SONG_COVER_FONT_FIELDS)

export function isSongFontWeightValue(value: unknown): value is SongFontWeightValue {
  return SONG_FONT_WEIGHT_OPTIONS.some((option) => option === value)
}

export function isSongListFontField(field: string): field is SongListFontField {
  return listFields.has(field)
}

export function isSongCoverFontField(field: string): field is SongCoverFontField {
  return coverFields.has(field)
}

export function emptySongFontWeightPreference(): SongFontWeightPreference {
  return { list: {}, cover: {} }
}

export function defaultSongFontWeight(
  view: SongFontWeightView,
  field: string,
): SongFontWeightValue | null {
  if (view === 'list' && isSongListFontField(field)) return SONG_FONT_WEIGHT_DEFAULTS.list[field]
  if (view === 'cover' && isSongCoverFontField(field)) return SONG_FONT_WEIGHT_DEFAULTS.cover[field]
  return null
}

export function songFontWeightCssVarName(view: SongFontWeightView, field: string): string | null {
  if (view === 'list' && !isSongListFontField(field)) return null
  if (view === 'cover' && !isSongCoverFontField(field)) return null
  return `--auralis-song-${view}-${FIELD_SLUG[field as SongCoverFontField]}-weight`
}

export function songFontWeightCssVars(
  preference: SongFontWeightPreference,
): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const field of SONG_LIST_FONT_FIELDS) {
    const name = songFontWeightCssVarName('list', field)
    if (!name) continue
    vars[name] = String(preference.list[field] ?? SONG_FONT_WEIGHT_DEFAULTS.list[field])
  }
  for (const field of SONG_COVER_FONT_FIELDS) {
    const name = songFontWeightCssVarName('cover', field)
    if (!name) continue
    vars[name] = String(preference.cover[field] ?? SONG_FONT_WEIGHT_DEFAULTS.cover[field])
  }
  return vars
}

export function serializeSongFontWeights(preference: SongFontWeightPreference): string {
  return JSON.stringify({
    version: SONG_FONT_WEIGHT_VERSION,
    list: preference.list,
    cover: preference.cover,
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function unusable(issue: string): SongFontWeightParseResult {
  return {
    preference: emptySongFontWeightPreference(),
    retainStorage: true,
    issues: [issue],
  }
}

function parseOverrides<Field extends string>(
  value: unknown,
  view: SongFontWeightView,
  isField: (field: string) => field is Field,
  issues: string[],
): Partial<Record<Field, SongFontWeightValue>> {
  if (value === undefined) return {}
  if (!isRecord(value)) {
    issues.push(`${view}:invalid`)
    return {}
  }

  const overrides: Partial<Record<Field, SongFontWeightValue>> = {}
  for (const [field, weight] of Object.entries(value)) {
    if (!isField(field)) {
      issues.push(`${view}.${field}:unknown`)
      continue
    }
    if (!isSongFontWeightValue(weight)) {
      issues.push(`${view}.${field}:invalid`)
      continue
    }
    overrides[field] = weight
  }
  return overrides
}

export function parseStoredSongFontWeights(raw: string | null): SongFontWeightParseResult {
  if (raw === null || raw === '') {
    return { preference: emptySongFontWeightPreference(), retainStorage: false, issues: [] }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return unusable('invalid-json')
  }

  if (!isRecord(parsed)) return unusable('invalid-shape')
  if (parsed.version !== SONG_FONT_WEIGHT_VERSION) return unusable('unsupported-version')

  const issues: string[] = []
  for (const key of Object.keys(parsed)) {
    if (key !== 'version' && key !== 'list' && key !== 'cover') issues.push(`${key}:unknown`)
  }

  return {
    preference: {
      list: parseOverrides(parsed.list, 'list', isSongListFontField, issues),
      cover: parseOverrides(parsed.cover, 'cover', isSongCoverFontField, issues),
    },
    retainStorage: false,
    issues,
  }
}
