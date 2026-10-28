import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import { canonicalizeDelimitedValues } from '@shared/utils/delimitedValues'
import { normalizeReleaseDate, releaseDateYear } from '@shared/utils/releaseDate'

export function normalizeEditableText(value: string | null): string | null {
  if (value === null) {
    return null
  }

  const normalized = value.trim()
  return normalized || null
}

export function normalizeEditableYear(value: number | null): number | null {
  if (value === null) {
    return null
  }

  if (!Number.isInteger(value) || value < 0 || value > 9999) {
    throw new Error('Year must be a number from 0 to 9999')
  }

  return value
}

export const normalizeEditableReleaseDate = normalizeReleaseDate
/** One normalization step shared by tag writing, verification and database storage. */
export function normalizeEditableMetadata(metadata: EditableTrackMetadata): EditableTrackMetadata {
  const releaseDate = normalizeReleaseDate(metadata.releaseDate)
  return {
    ...metadata,
    title: normalizeEditableText(metadata.title),
    artistDisplay: canonicalizeDelimitedValues(metadata.artistDisplay),
    albumTitle: normalizeEditableText(metadata.albumTitle),
    albumArtistDisplay: canonicalizeDelimitedValues(metadata.albumArtistDisplay),
    genreDisplay: canonicalizeDelimitedValues(metadata.genreDisplay),
    year: releaseDateYear(releaseDate),
    releaseDate,
  }
}
