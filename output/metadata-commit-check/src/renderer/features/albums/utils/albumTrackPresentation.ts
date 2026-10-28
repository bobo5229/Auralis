export interface AlbumTrackPresentation {
  displayNumber: number
  selected: boolean
  playing: boolean
  highlighted: boolean
}

export function resolveAlbumTrackPresentation(
  trackId: number,
  trackNo: number | null,
  fallbackIndex: number,
  selectedTrackId: number | null,
  currentTrackId: number | null,
  highlightedTrackId: number | null,
): AlbumTrackPresentation {
  return {
    displayNumber: trackNo ?? fallbackIndex + 1,
    selected: selectedTrackId === trackId,
    playing: currentTrackId === trackId,
    highlighted: highlightedTrackId === trackId,
  }
}
