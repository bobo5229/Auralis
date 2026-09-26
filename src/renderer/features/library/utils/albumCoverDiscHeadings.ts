interface DiscNumberedTrack {
  discNo: number | null
}

/** Count one heading per distinct disc when the current group contains multiple discs. */
export function getAlbumCoverDiscHeadingCount(tracks: readonly DiscNumberedTrack[]): number {
  const discNumbers = new Set(tracks.map((track) => track.discNo ?? 1))
  return discNumbers.size > 1 ? discNumbers.size : 0
}

/** Return a heading only before each disc's first track, preserving the supplied track order. */
export function getAlbumCoverTrackDiscHeadings(
  tracks: readonly DiscNumberedTrack[],
): Array<number | null> {
  const headingCount = getAlbumCoverDiscHeadingCount(tracks)
  const seenDiscNumbers = new Set<number>()

  return tracks.map((track) => {
    const discNumber = track.discNo ?? 1
    const heading = headingCount > 0 && !seenDiscNumbers.has(discNumber) ? discNumber : null
    seenDiscNumbers.add(discNumber)
    return heading
  })
}

export function formatAlbumCoverDiscHeading(discNumber: number): string {
  return `Disc ${String(discNumber).padStart(2, '0')}`
}
