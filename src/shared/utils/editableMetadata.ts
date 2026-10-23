import type { EditableTrackMetadata } from '../types/libraryScan'
import { canonicalizeDelimitedValues } from './delimitedValues'

/** Compare editable values only, using the same text/list semantics as saving. */
export function isSameEditableMetadata(
  left: EditableTrackMetadata,
  right: EditableTrackMetadata,
): boolean {
  const text = (value: string | null) => value?.trim() || null
  return (
    left.trackId === right.trackId &&
    text(left.title) === text(right.title) &&
    text(left.albumTitle) === text(right.albumTitle) &&
    canonicalizeDelimitedValues(left.artistDisplay) ===
      canonicalizeDelimitedValues(right.artistDisplay) &&
    canonicalizeDelimitedValues(left.albumArtistDisplay) ===
      canonicalizeDelimitedValues(right.albumArtistDisplay) &&
    canonicalizeDelimitedValues(left.genreDisplay) ===
      canonicalizeDelimitedValues(right.genreDisplay) &&
    left.year === right.year &&
    text(left.releaseDate) === text(right.releaseDate)
  )
}
