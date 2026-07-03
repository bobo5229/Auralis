/**
 * Generic utilities for splitting and formatting semicolon-delimited
 * multi-value metadata fields (artists, genres, etc.).
 *
 * Format rules:
 *   A; B       → A & B
 *   A; B; C    → A, B & C
 */

export function splitDelimitedValues(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .split(/[;,]/)
    .map((p) => p.trim())
    .filter(Boolean)
}

export function isMultiValue(value: string | null | undefined): boolean {
  return splitDelimitedValues(value).length >= 2
}

export function formatDelimitedValues(value: string | null | undefined): string {
  const parts = splitDelimitedValues(value)

  if (parts.length <= 1) return parts[0] ?? ''

  const last = parts.pop()!
  return `${parts.join(', ')} & ${last}`
}
