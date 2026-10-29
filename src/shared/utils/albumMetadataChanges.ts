import type { FileTagValues } from '../types/trackMetadata'
import type { AlbumEditOperations } from '../types/albumMetadataEdit'
import { ALBUM_EDIT_FIELDS } from '../types/albumMetadataEdit'
import { splitDelimitedValues, canonicalizeDelimitedValues } from './delimitedValues'
import { normalizeMetadataField } from './metadataEditRequest'
import { normalizeReleaseDate } from './releaseDate'

export function albumMetadataChanges(
  base: FileTagValues,
  operations: AlbumEditOperations,
): Partial<FileTagValues> {
  const changes: Partial<FileTagValues> = {}
  for (const field of ALBUM_EDIT_FIELDS) {
    const operation = operations[field]
    if (!operation || operation.mode === 'keep') continue
    let value = operation.mode === 'clear' ? null : operation.value?.trim() || null
    if (field === 'genreDisplay' && ['add', 'remove'].includes(operation.mode)) {
      const existing = splitDelimitedValues(base.genreDisplay),
        selected = splitDelimitedValues(value)
      value = canonicalizeDelimitedValues(
        (operation.mode === 'add'
          ? [...existing, ...selected]
          : existing.filter(
              (item) =>
                !selected.some((value) => value.toLocaleLowerCase() === item.toLocaleLowerCase()),
            )
        ).join('; '),
      )
    } else if (['add', 'remove'].includes(operation.mode)) throw new Error('Invalid operation')
    if (field === 'releaseDate') value = normalizeReleaseDate(value)
    const normalized = normalizeMetadataField(field, value)
    if (normalized !== normalizeMetadataField(field, base[field]))
      Object.assign(changes, { [field]: normalized })
  }
  return changes
}
