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

/**
 * Formats track duration seconds into M:SS or returns fallback (--:--).
 */
export function formatTrackDuration(
  durationSeconds: number | null | undefined,
  fallback = '--:--',
): FormattedMetadataField {
  if (
    durationSeconds === null ||
    durationSeconds === undefined ||
    Number.isNaN(durationSeconds) ||
    durationSeconds < 0
  ) {
    return { text: fallback, missing: true }
  }

  const totalSeconds = Math.floor(durationSeconds)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const formatted = `${minutes}:${String(seconds).padStart(2, '0')}`
  return { text: formatted, missing: false }
}

/**
 * Formats track number into 2-digit string or returns fallback (--).
 */
export function formatTrackNumber(
  trackNo: number | null | undefined,
  fallback = '--',
): FormattedMetadataField {
  if (trackNo === null || trackNo === undefined || Number.isNaN(trackNo) || trackNo <= 0) {
    return { text: fallback, missing: true }
  }

  return { text: String(trackNo).padStart(2, '0'), missing: false }
}
