export type LibraryKeyboardMoveDirection = 'next' | 'prev' | 'first' | 'last'

export function resolveKeyboardFocusTrackId(input: {
  trackCount: number
  currentFocusId: number | null
  selectedTrackId: number | null
  currentTrackId: number | null
  hasTrack: (id: number) => boolean
  firstTrackId: number | null
}): number | null {
  if (input.trackCount === 0) return null

  if (input.currentFocusId !== null && input.hasTrack(input.currentFocusId)) {
    return input.currentFocusId
  }

  if (input.selectedTrackId !== null && input.hasTrack(input.selectedTrackId)) {
    return input.selectedTrackId
  }

  if (input.currentTrackId !== null && input.hasTrack(input.currentTrackId)) {
    return input.currentTrackId
  }

  return input.firstTrackId
}

export function resolveKeyboardMoveIndex(input: {
  direction: LibraryKeyboardMoveDirection
  currentIndex: number
  lastIndex: number
}): number {
  if (input.direction === 'first') return 0
  if (input.direction === 'last') return input.lastIndex
  if (input.currentIndex < 0) return 0
  if (input.direction === 'next') {
    return Math.min(input.lastIndex, input.currentIndex + 1)
  }
  return Math.max(0, input.currentIndex - 1)
}
