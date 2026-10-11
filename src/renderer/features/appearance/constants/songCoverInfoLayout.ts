import { DEFAULT_COVER_METADATA_LAYOUT } from '@renderer/features/library/constants/libraryLayoutMetrics'

export const SONG_COVER_INFO_LAYOUT_STORAGE_KEY = 'auralis-song-cover-info-layout'
export const COVER_INFO_ALIGNMENTS = ['left', 'center', 'right'] as const
export type CoverInfoAlignment = (typeof COVER_INFO_ALIGNMENTS)[number]
export type CoverInfoSpacingField = 'artworkGap' | 'albumArtistGap' | 'artistDateGap'
export interface SongCoverInfoLayout {
  artworkGap: number
  albumArtistGap: number
  artistDateGap: number
  alignment: CoverInfoAlignment
}
export const DEFAULT_SONG_COVER_INFO_LAYOUT: Readonly<SongCoverInfoLayout> = {
  artworkGap: DEFAULT_COVER_METADATA_LAYOUT.artworkGap,
  albumArtistGap: DEFAULT_COVER_METADATA_LAYOUT.albumArtistGap,
  artistDateGap: DEFAULT_COVER_METADATA_LAYOUT.artistDateGap,
  alignment: 'left',
}
export const COVER_INFO_SPACING_RANGES = {
  artworkGap: { min: 0, max: 40 },
  albumArtistGap: { min: 0, max: 20 },
  artistDateGap: { min: 0, max: 20 },
} as const

export function isCoverInfoSpacing(field: CoverInfoSpacingField, value: unknown): value is number {
  const range = COVER_INFO_SPACING_RANGES[field]
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= range.min && value <= range.max
  )
}
export function isCoverInfoAlignment(value: unknown): value is CoverInfoAlignment {
  return COVER_INFO_ALIGNMENTS.some((alignment) => alignment === value)
}
export function parseSongCoverInfoLayout(raw: string | null): SongCoverInfoLayout {
  const result = { ...DEFAULT_SONG_COVER_INFO_LAYOUT }
  if (!raw) return result
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return result
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    (parsed.version !== 1 && parsed.version !== 2)
  )
    return result
  const stored = parsed as Record<string, unknown>
  // Preserve the former shared gap on both boundaries until they are adjusted separately.
  if (stored.version === 1 && isCoverInfoSpacing('albumArtistGap', stored.lineGap)) {
    result.albumArtistGap = stored.lineGap
    result.artistDateGap = stored.lineGap
  }
  for (const field of ['artworkGap', 'albumArtistGap', 'artistDateGap'] as const) {
    if (isCoverInfoSpacing(field, stored[field])) result[field] = stored[field]
  }
  if (isCoverInfoAlignment(stored.alignment)) result.alignment = stored.alignment
  return result
}
