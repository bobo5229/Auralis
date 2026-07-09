/**
 * Generic utilities for splitting and formatting semicolon-delimited
 * multi-value metadata fields (artists, genres, etc.).
 *
 * Format rules:
 *   A; B       → A & B
 *   A; B; C    → A, B & C
 *   A; B; C; D → A, B, C & D
 */

import { splitDelimitedValues } from '@shared/utils/delimitedValues'

export { splitDelimitedValues }

export function isMultiValue(value: string | null | undefined): boolean {
  return splitDelimitedValues(value).length >= 2
}

export function formatDelimitedValues(value: string | null | undefined): string {
  const parts = splitDelimitedValues(value)

  if (parts.length <= 1) return parts[0] ?? ''

  const last = parts.pop()!
  return `${parts.join(', ')} & ${last}`
}
