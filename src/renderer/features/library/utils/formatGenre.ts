import {
  formatDelimitedParts,
  formatDelimitedValues,
  isMultiValue,
  splitDelimitedValues,
} from './formatDelimitedValues'

/** Parse multi-value genre for matching / aggregation (not for display). */
export function splitGenreValues(value: string | null | undefined): string[] {
  return splitDelimitedValues(value)
}

export function isMultiValueGenre(value: string | null | undefined): boolean {
  return isMultiValue(value)
}

/**
 * Read-only multi-value genre display: `A & B` / `A, B & C`.
 * All UI that shows a track/album multi-genre string must use this (or formatGenreParts).
 */
export function formatGenre(value: string | null | undefined): string {
  return formatDelimitedValues(value)
}

/** Same display rule for an already-split label list. */
export function formatGenreParts(parts: readonly string[]): string {
  return formatDelimitedParts(parts)
}
