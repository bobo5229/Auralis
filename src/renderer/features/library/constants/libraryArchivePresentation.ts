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
