import { extname } from 'node:path'
import type { MetadataEditCapabilities } from '@shared/types/trackMetadata'
import { EDITABLE_TAG_FIELDS } from '@shared/utils/metadataEditRequest'

/** Supported adapters are shared by snapshot feedback and the final save boundary. */
export function metadataEditCapabilities(path: string): MetadataEditCapabilities {
  const format = extname(path).toLowerCase()
  const supported = ['.flac', '.mp3', '.m4a', '.ogg', '.opus'].includes(format)
  return {
    fields: Object.fromEntries(
      EDITABLE_TAG_FIELDS.map((field) => [field, supported]),
    ) as MetadataEditCapabilities['fields'],
    datePrecisions: supported
      ? format === '.mp3'
        ? ['year', 'day']
        : ['year', 'month', 'day']
      : [],
    artwork: ['.flac', '.mp3', '.m4a'].includes(format),
  }
}
