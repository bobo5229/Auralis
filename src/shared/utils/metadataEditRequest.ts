import type { EditableTrackMetadata } from '../types/libraryScan'
import type { EditableTagField, UpdateTrackMetadataRequest } from '../types/trackMetadata'
import { canonicalizeDelimitedValues } from './delimitedValues'

export const EDITABLE_TAG_FIELDS: readonly EditableTagField[] = [
  'title',
  'artistDisplay',
  'albumTitle',
  'albumArtistDisplay',
  'genreDisplay',
  'releaseDate',
  'trackNo',
  'trackTotal',
  'discNo',
  'discTotal',
  'composer',
  'copyright',
  'isrc',
]
export const LEGACY_TAG_FIELDS = [
  'title',
  'artistDisplay',
  'albumTitle',
  'albumArtistDisplay',
  'genreDisplay',
  'year',
  'releaseDate',
] as const
export const NUMBER_TAG_FIELDS = ['trackNo', 'trackTotal', 'discNo', 'discTotal'] as const
export function normalizeMetadataField(
  field: EditableTagField,
  value: unknown,
): string | number | null {
  if ((NUMBER_TAG_FIELDS as readonly string[]).includes(field))
    return value == null || value === '' ? null : Number(value)
  const text = typeof value === 'string' ? value : null
  return ['artistDisplay', 'albumArtistDisplay', 'genreDisplay', 'composer'].includes(field)
    ? canonicalizeDelimitedValues(text)
    : text?.trim() || null
}
export function createMetadataEditRequest(
  value: EditableTrackMetadata,
  baseline: EditableTrackMetadata,
): UpdateTrackMetadataRequest {
  if (!baseline.editToken) throw new Error('Metadata edit snapshot is missing')
  const changes: UpdateTrackMetadataRequest['changes'] = {}
  for (const field of EDITABLE_TAG_FIELDS) {
    const normalized = normalizeMetadataField(field, value[field])
    if (normalized !== normalizeMetadataField(field, baseline[field]))
      Object.assign(changes, { [field]: normalized })
  }
  return {
    trackId: value.trackId,
    editToken: baseline.editToken,
    changes,
    ...(value.legacyAction ? { legacyAction: value.legacyAction } : {}),
    ...(value.artworkChanges?.length ? { artworkChanges: value.artworkChanges } : {}),
  }
}
