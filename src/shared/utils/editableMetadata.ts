import type { EditableTrackMetadata } from '../types/libraryScan'
import { EDITABLE_TAG_FIELDS, normalizeMetadataField } from './metadataEditRequest'
import { canonicalizeDelimitedValues } from './delimitedValues'

/** Compare editable values only, using the same text/list semantics as saving. */
export function isSameEditableMetadata(
  left: EditableTrackMetadata,
  right: EditableTrackMetadata,
): boolean {
  const text = (value: string | null) => value?.trim() || null
  const date = (value: EditableTrackMetadata) =>
    text(value.releaseDate) ?? (value.year === null ? null : String(value.year).padStart(4, '0'))
  return (
    left.trackId === right.trackId &&
    JSON.stringify(left.artworkChanges ?? []) === JSON.stringify(right.artworkChanges ?? []) &&
    EDITABLE_TAG_FIELDS.filter((field) => field !== 'releaseDate').every(
      (field) =>
        normalizeMetadataField(field, left[field]) === normalizeMetadataField(field, right[field]),
    ) &&
    text(left.title) === text(right.title) &&
    text(left.albumTitle) === text(right.albumTitle) &&
    canonicalizeDelimitedValues(left.artistDisplay) ===
      canonicalizeDelimitedValues(right.artistDisplay) &&
    canonicalizeDelimitedValues(left.albumArtistDisplay) ===
      canonicalizeDelimitedValues(right.albumArtistDisplay) &&
    canonicalizeDelimitedValues(left.genreDisplay) ===
      canonicalizeDelimitedValues(right.genreDisplay) &&
    date(left) === date(right)
  )
}
