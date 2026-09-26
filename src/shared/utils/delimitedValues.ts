/**
 * Multi-value metadata parser — single source of truth.
 *
 * ## Parse (storage / tags → list)
 * Split only on the half-width semicolon followed by a half-width space: `"; "`.
 *
 * **`/` is NOT a multi-value separator.** Slash compounds stay atomic, e.g.:
 * - Genre: `R&B/SOUL`, `Hip-hop/Rap`
 * - Artist: `AC/DC`
 * True multi-value tags must use `; ` (e.g. `Rock; Pop`, not `Rock, Pop` or `Rock/Pop`).
 *
 * ## Display (list → UI string) — mandatory for all multi-value UI
 * Never show the raw `; ` delimiter in read-only UI.
 * Always use:
 * - 1 value: `A`
 * - 2 values: `A & B`
 * - 3+ values: `A, B & C` (Oxford-style: commas between head, ` & ` before last)
 *
 * Edit fields may keep the raw stored string; everywhere else that *displays*
 * multi-value fields must go through {@link formatDelimitedValues} /
 * {@link formatDelimitedParts} (or renderer `formatGenre` / `formatArtist`).
 */

/**
 * Split multi-value metadata into atomic labels (order preserved, no empty parts).
 * Example: `"Jazz; Soul"` → `["Jazz", "Soul"]`; `"Jazz, Soul"` stays one value.
 * Slash compounds stay one label: `"R&B/SOUL"` → `["R&B/SOUL"]`.
 */
export function splitDelimitedValues(value: string | null | undefined): string[] {
  if (!value) return []

  return value
    .split('; ')
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * Format already-split labels for UI: `A & B` / `A, B & C`.
 */
export function formatDelimitedParts(parts: readonly string[]): string {
  const cleaned = parts.map((part) => part.trim()).filter(Boolean)
  if (cleaned.length === 0) return ''
  if (cleaned.length === 1) return cleaned[0]!

  const head = cleaned.slice(0, -1)
  const last = cleaned[cleaned.length - 1]!
  return `${head.join(', ')} & ${last}`
}

/**
 * Split then format for UI. Use for any read-only multi-value display.
 */
export function formatDelimitedValues(value: string | null | undefined): string {
  return formatDelimitedParts(splitDelimitedValues(value))
}

export function normalizeDelimitedValue(value: string): string {
  return value.trim().toLocaleLowerCase()
}
