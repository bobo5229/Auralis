/**
 * Renderer wrappers for multi-value metadata (artists, genres, …).
 *
 * Rules (see `@shared/utils/delimitedValues`):
 * - Parse: split on `"; "` / `", "` / full-width / `/`
 * - Display (read-only UI only): `A & B` / `A, B & C` — never raw separators
 */

import {
  formatDelimitedParts,
  formatDelimitedValues,
  splitDelimitedValues,
} from '@shared/utils/delimitedValues'

export {
  formatDelimitedParts,
  formatDelimitedValues,
  splitDelimitedValues,
}

export function isMultiValue(value: string | null | undefined): boolean {
  return splitDelimitedValues(value).length >= 2
}
