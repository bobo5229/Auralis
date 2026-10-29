import type { EditableTrackMetadata } from '../types/libraryScan'
import type { EditableTagField } from '../types/trackMetadata'
import { EDITABLE_TAG_FIELDS, normalizeMetadataField } from './metadataEditRequest'
import { releaseDateYear } from './releaseDate'

/** Three-way merge. Unresolved fields retain the user's input until explicitly chosen. */
export function mergeMetadataDraft(
  baseline: EditableTrackMetadata,
  latest: EditableTrackMetadata,
  draft: EditableTrackMetadata,
): { value: EditableTrackMetadata; conflicts: EditableTagField[] } {
  const value = { ...latest }
  const conflicts: EditableTagField[] = []
  for (const field of EDITABLE_TAG_FIELDS) {
    const base = normalizeMetadataField(field, baseline[field])
    const file = normalizeMetadataField(field, latest[field])
    const mine = normalizeMetadataField(field, draft[field])
    if (mine === base) continue
    Object.assign(value, { [field]: draft[field] ?? null })
    if (file !== base && file !== mine) conflicts.push(field)
  }
  value.year = releaseDateYear(value.releaseDate)
  return { value, conflicts }
}
