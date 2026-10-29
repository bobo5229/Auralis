export interface LibrarySearchRecord {
  readonly title: string
  readonly artist: string
  readonly artistParts: readonly string[]
  readonly albumArtist: string
  readonly albumArtistParts: readonly string[]
  readonly album: string
  readonly displayAliases?: readonly string[]
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
    record.artistParts.some((artist) => artist.startsWith(normalizedQuery)) ||
    record.albumArtist.startsWith(normalizedQuery) ||
    record.albumArtistParts.some((artist) => artist.startsWith(normalizedQuery)) ||
    record.album.startsWith(normalizedQuery) ||
    Boolean(record.displayAliases?.some((key) => key.startsWith(normalizedQuery)))
  )
}

/** One query cache per search session; new snapshots or queries replace it. */
export function createLibrarySearchScanner() {
  let previousRecords: readonly LibrarySearchRecord[] | undefined
  let previousQuery = ''
  let matches: number[] = []
  return (
    records: readonly LibrarySearchRecord[],
    normalizedQuery: string,
    fromIndex: number,
  ): LibrarySearchScanResult => {
    if (records !== previousRecords || normalizedQuery !== previousQuery) {
      matches = []
      if (normalizedQuery) {
        for (let index = 0; index < records.length; index++) {
          if (matchesSearchRecord(records[index], normalizedQuery)) matches.push(index)
        }
      }
      previousRecords = records
      previousQuery = normalizedQuery
    }
    if (!matches.length)
      return { totalMatches: 0, targetIndex: null, matchPosition: null, wrapped: false }
    const startIndex = Math.max(0, Math.min(records.length, fromIndex))
    let low = 0
    let high = matches.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (matches[middle] < startIndex) low = middle + 1
      else high = middle
    }
    const wrapped = low === matches.length
    const position = wrapped ? 0 : low
    return {
      totalMatches: matches.length,
      targetIndex: matches[position],
      matchPosition: position + 1,
      wrapped,
    }
  }
}

/** One-off scan for callers without a search session. */
export function scanLibrarySearchIndex(
  records: readonly LibrarySearchRecord[],
  normalizedQuery: string,
  fromIndex: number,
): LibrarySearchScanResult {
  return createLibrarySearchScanner()(records, normalizedQuery, fromIndex)
}
