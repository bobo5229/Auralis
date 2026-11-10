export interface AlbumTrackPresentation {
  displayNumber: number
  current: boolean
  highlighted: boolean
}

export function resolveAlbumTrackPresentation(
  trackId: number,
  trackNo: number | null,
  fallbackIndex: number,
  currentTrackId: number | null,
  highlightedTrackId: number | null,
): AlbumTrackPresentation {
  return {
    displayNumber: trackNo ?? fallbackIndex + 1,
    current: currentTrackId === trackId,
    highlighted: highlightedTrackId === trackId,
  }
}
