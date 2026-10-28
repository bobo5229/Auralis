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
]
export function createMetadataEditRequest(
  value: EditableTrackMetadata,
  baseline: EditableTrackMetadata,
): UpdateTrackMetadataRequest {
  if (!baseline.editToken) throw new Error('Metadata edit snapshot is missing')
  const changes: UpdateTrackMetadataRequest['changes'] = {}
  for (const field of EDITABLE_TAG_FIELDS) {
    const normalize = (text: string | null) =>
      ['artistDisplay', 'albumArtistDisplay', 'genreDisplay'].includes(field)
        ? canonicalizeDelimitedValues(text)
        : text?.trim() || null
    if (normalize(value[field]) !== normalize(baseline[field]))
      changes[field] = normalize(value[field])
  }
  return {
    trackId: value.trackId,
    editToken: baseline.editToken,
    changes,
    ...(value.legacyAction ? { legacyAction: value.legacyAction } : {}),
  }
}
