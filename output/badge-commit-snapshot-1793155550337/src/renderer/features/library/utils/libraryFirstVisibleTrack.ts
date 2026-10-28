export function resolveFirstVisibleTrackIndex(input: {
  scrollTop: number
  topInset: number
  isCoverView: boolean
  flatRowHeight: number
  trackCount: number
  virtualAlbumGroups: ReadonlyArray<{ index: number; end: number }>
  albumGroups: ReadonlyArray<{ firstTrackIndex: number }>
}): number {
  if (input.trackCount === 0) return 0

  const offset = Math.max(0, input.scrollTop - input.topInset)
  let newIndex = 0

  if (!input.isCoverView) {
    newIndex = Math.floor(offset / input.flatRowHeight)
  } else if (input.virtualAlbumGroups.length > 0) {
    const firstVisibleVirtualItem =
      input.virtualAlbumGroups.find((item) => item.end > offset) ?? input.virtualAlbumGroups[0]
    const group = input.albumGroups[firstVisibleVirtualItem.index]
    if (group) {
      newIndex = group.firstTrackIndex
    }
  }

  return Math.max(0, Math.min(newIndex, input.trackCount - 1))
}
