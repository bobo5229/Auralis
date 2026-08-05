import {
  formatDelimitedParts,
  formatDelimitedValues,
  isMultiValue,
  splitDelimitedValues,
} from './formatDelimitedValues'

export function splitArtistValues(value: string | null | undefined): string[] {
  return splitDelimitedValues(value)
}

export function isMultiValueArtist(value: string | null | undefined): boolean {
  return isMultiValue(value)
}

/** Read-only multi-value artist display: `A & B` / `A, B & C`. */
export function formatArtist(value: string | null | undefined): string {
  return formatDelimitedValues(value)
}

export function formatArtistParts(parts: readonly string[]): string {
  return formatDelimitedParts(parts)
}
