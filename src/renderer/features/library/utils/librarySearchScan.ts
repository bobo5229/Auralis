export interface LibrarySearchRecord {
  readonly title: string
  readonly artist: string
  readonly albumArtist: string
  readonly album: string
}

export interface LibrarySearchScanResult {
  readonly totalMatches: number
  readonly targetIndex: number | null
  readonly matchPosition: number | null
  readonly wrapped: boolean
}

function matchesSearchRecord(record: LibrarySearchRecord, normalizedQuery: string): boolean {
  return (
    record.title.startsWith(normalizedQuery) ||
    record.artist.startsWith(normalizedQuery) ||
    record.albumArtist.startsWith(normalizedQuery) ||
    record.album.startsWith(normalizedQuery)
  )
}

/**
 * Scan the ordered records once and resolve both the next target and its feedback metadata.
 * `fromIndex` is inclusive; a target before it means the search wrapped around.
 */
export function scanLibrarySearchIndex(
  records: readonly LibrarySearchRecord[],
  normalizedQuery: string,
  fromIndex: number,
): LibrarySearchScanResult {
  if (!normalizedQuery) {
    return { totalMatches: 0, targetIndex: null, matchPosition: null, wrapped: false }
  }

  const startIndex = Math.max(0, Math.min(records.length, fromIndex))
  let totalMatches = 0
  let nextIndex: number | null = null
  let nextMatchPosition: number | null = null
  let wrappedIndex: number | null = null
  let wrappedMatchPosition: number | null = null

  for (let index = 0; index < records.length; index += 1) {
    if (!matchesSearchRecord(records[index], normalizedQuery)) continue

    totalMatches += 1

    if (index >= startIndex && nextIndex === null) {
      nextIndex = index
      nextMatchPosition = totalMatches
    } else if (index < startIndex && wrappedIndex === null) {
      wrappedIndex = index
      wrappedMatchPosition = totalMatches
    }
  }

  if (nextIndex !== null) {
    return {
      totalMatches,
      targetIndex: nextIndex,
      matchPosition: nextMatchPosition,
      wrapped: false,
    }
  }

  if (wrappedIndex !== null) {
    return {
      totalMatches,
      targetIndex: wrappedIndex,
      matchPosition: wrappedMatchPosition,
      wrapped: true,
    }
  }

  return { totalMatches, targetIndex: null, matchPosition: null, wrapped: false }
}
