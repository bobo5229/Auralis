/**
 * Renderer wrappers for multi-value metadata (artists, genres, …).
 *
 * Rules (see `@shared/utils/delimitedValues`):
 * - Parse only on the half-width `; ` delimiter
 * - Display (read-only UI only): `A & B` / `A, B & C`; never show raw `; ` delimiters
 */

import {
  formatDelimitedParts,
  formatDelimitedValues,
  splitDelimitedValues,
} from '@shared/utils/delimitedValues'

export { formatDelimitedParts, formatDelimitedValues, splitDelimitedValues }

export function isMultiValue(value: string | null | undefined): boolean {
  return splitDelimitedValues(value).length >= 2
}
