export const LIBRARY_ARCHIVE_FOLIO_SIZE = 50

export interface FolioInfo {
  currentFolio: number
  totalFolios: number
}

/**
 * Calculates current and total FOLIO pagination info for manuscript view.
 * FOLIO is purely visual archive indexing (50 items per folio page).
 */
export function calculateFolioInfo(trackCount: number, firstVisibleIndex: number): FolioInfo {
  if (trackCount <= 0) {
    return { currentFolio: 0, totalFolios: 0 }
  }

  const totalFolios = Math.ceil(trackCount / LIBRARY_ARCHIVE_FOLIO_SIZE)
  const clampedIndex = Math.max(0, Math.min(firstVisibleIndex, trackCount - 1))
  const rawCurrent = Math.floor(clampedIndex / LIBRARY_ARCHIVE_FOLIO_SIZE) + 1
  const currentFolio = Math.max(1, Math.min(rawCurrent, totalFolios))

  return { currentFolio, totalFolios }
}

/**
 * Formats a folio number with at least 3 digits (e.g. 004, 025, 120).
 */
export function formatFolioNumber(folio: number): string {
  if (folio <= 0) return '000'
  return String(folio).padStart(3, '0')
}

/**
 * Formats track row index into tabular string (e.g. 0001, 0047, 10245).
 * Min width 4 digits, expands if totalTracks > 9999.
 */
export function formatTrackIndexNumber(index: number, totalTracks = 0): string {
  const num = index + 1
  const minDigits = Math.max(4, String(totalTracks).length)
  return String(num).padStart(minDigits, '0')
}

/**
 * Formats catalog album number into padded string (e.g. 001, 012, 104).
 */
export function formatCatalogNumber(index: number, totalGroups = 0): string {
  const num = index + 1
  const minDigits = Math.max(3, String(totalGroups).length)
  return String(num).padStart(minDigits, '0')
}
