import {
  SONG_COVER_FONT_FIELDS,
  SONG_LIST_FONT_FIELDS,
  isSongCoverFontField,
  isSongListFontField,
  songFontWeightCssVarName,
  type SongCoverFontField,
  type SongListFontField,
  type SongFontWeightView,
} from './songFontWeights'

export const SONG_FONT_SIZE_STORAGE_KEY = 'auralis-song-font-sizes'
export interface SongFontSizePreference {
  list: Partial<Record<SongListFontField, number>>
  cover: Partial<Record<SongCoverFontField, number>>
}

export const SONG_FONT_SIZE_DEFAULTS = {
  list: { title: 14, artist: 12, album: 12, duration: 12 },
  cover: {
    title: 14,
    artist: 12,
    album: 16,
    albumArtist: 12,
    releaseDate: 12,
    trackNumber: 12,
    genre: 12,
    duration: 12,
    discHeading: 11,
  },
} as const

export function emptySongFontSizePreference(): SongFontSizePreference {
  return { list: {}, cover: {} }
}

export function defaultSongFontSize(view: SongFontWeightView, field: string): number | null {
  if (view === 'list' && isSongListFontField(field)) return SONG_FONT_SIZE_DEFAULTS.list[field]
  if (view === 'cover' && isSongCoverFontField(field)) return SONG_FONT_SIZE_DEFAULTS.cover[field]
  return null
}

// Bound sizes to the existing 44/48px virtual rows, 20px metadata and 24px disc headings.
export function songFontSizeRange(view: SongFontWeightView, field: string) {
  if (view === 'cover') {
    if (field === 'discHeading') return { min: 9, max: 18 }
    if (field === 'artist') return { min: 10, max: 18 }
    if (['title', 'album', 'albumArtist', 'releaseDate'].includes(field)) {
      return { min: 10, max: 20 }
    }
    // The track-number and duration columns must also accommodate two digits / m:ss.
    if (field === 'trackNumber' || field === 'duration') return { min: 10, max: 18 }
  }
  if (field === 'duration') return { min: 10, max: 20 }
  return { min: 10, max: 24 }
}

export function isSongFontSize(
  view: SongFontWeightView,
  field: string,
  value: unknown,
): value is number {
  const range = songFontSizeRange(view, field)
  return (
    defaultSongFontSize(view, field) !== null &&
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= range.min &&
    value <= range.max
  )
}

export function songFontSizeCssVarName(view: SongFontWeightView, field: string): string | null {
  return songFontWeightCssVarName(view, field)?.replace(/-weight$/, '-size') ?? null
}

export function songFontSizeCssVars(preference: SongFontSizePreference): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const view of ['list', 'cover'] as const) {
    const overrides: Readonly<Record<string, number | undefined>> = preference[view]
    for (const field of view === 'list' ? SONG_LIST_FONT_FIELDS : SONG_COVER_FONT_FIELDS) {
      const name = songFontSizeCssVarName(view, field)
      if (name) vars[name] = `${overrides[field] ?? defaultSongFontSize(view, field)}px`
    }
  }
  return vars
}

export function parseStoredSongFontSizes(raw: string | null): SongFontSizePreference {
  const preference = emptySongFontSizePreference()
  if (!raw) return preference
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return preference
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    parsed.version !== 1
  )
    return preference
  for (const view of ['list', 'cover'] as const) {
    const fields: unknown = (parsed as Record<string, unknown>)[view]
    if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) continue
    for (const [field, value] of Object.entries(fields)) {
      if (isSongFontSize(view, field, value)) Object.assign(preference[view], { [field]: value })
    }
  }
  return preference
}
