export interface FormattedMetadataField {
  text: string
  missing: boolean
}

/**
 * Helper to check metadata field after trimming.
 * Returns display text and boolean flag indicating missing state.
 */
export function formatMetadataDisplay(
  raw: string | number | null | undefined,
  fallbackText: string,
): FormattedMetadataField {
  if (raw === null || raw === undefined) {
    return { text: fallbackText, missing: true }
  }

  if (typeof raw === 'number') {
    if (Number.isNaN(raw) || raw <= 0) {
      return { text: fallbackText, missing: true }
    }
    return { text: String(raw), missing: false }
  }

  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return { text: fallbackText, missing: true }
  }

  return { text: trimmed, missing: false }
}
