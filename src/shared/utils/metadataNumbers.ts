import type { EditableTrackMetadata } from '../types/libraryScan'
import type { UpdateTrackMetadataRequest } from '../types/trackMetadata'
import { NUMBER_TAG_FIELDS } from './metadataEditRequest'

export function validateMetadataChanges(
  base: EditableTrackMetadata,
  changes: UpdateTrackMetadataRequest['changes'],
): void {
  for (const field of NUMBER_TAG_FIELDS) {
    if (!Object.hasOwn(changes, field)) continue
    const value = changes[field]
    if (value !== null && (!Number.isInteger(value) || value! < 1 || value! > 65535))
      throw new Error('Number must be between 1 and 65535')
  }
  const merged = { ...base, ...changes }
  for (const [number, total] of [
    ['trackNo', 'trackTotal'],
    ['discNo', 'discTotal'],
  ] as const) {
    if (!Object.hasOwn(changes, number) && !Object.hasOwn(changes, total)) continue
    const no = merged[number],
      of = merged[total]
    for (const value of [no, of])
      if (value != null && (!Number.isInteger(value) || value < 1 || value > 65535))
        throw new Error('Number must be between 1 and 65535')
    if (no != null && of != null && no > of) throw new Error('Number exceeds total')
  }
}
