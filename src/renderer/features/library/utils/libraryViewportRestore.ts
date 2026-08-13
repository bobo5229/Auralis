/**
 * Viewport-first restore for background library refreshes. The song list must
 * not be dragged back to the playing / selected / keyboard-focused track: a
 * double-click play writes those states, and playback reads open audio files
 * that the watcher may (erroneously) turn into refresh events. Restoring the
 * user's actual viewport is the only stable contract.
 */
export interface LibraryViewportRestore {
  scrollTop: number
  firstVisibleTrackId: number | null
  scrollGeneration: number
}

export type LibraryViewportRestoreAction =
  | { type: 'keep-scroll-top'; scrollTop: number }
  | { type: 'scroll-to-track'; trackId: number }
  | { type: 'no-op' }

/**
 * Decide how a background refresh restores the song-list viewport:
 *  - the user scrolled during the snapshot round-trip (generation moved) →
 *    abandon the restore entirely;
 *  - the ordered track id sequence is unchanged → write back the captured
 *    scrollTop (1px-level rounding allowed);
 *  - the sequence changed but the first visible track survives → scroll that
 *    track into view, never a 33% playback position and never a fallback to
 *    current / selected / keyboard focus;
 *  - the first visible track is gone → do not scroll at all.
 */
export function resolveLibraryViewportRestoreAction(input: {
  captured: LibraryViewportRestore
  currentScrollGeneration: number
  previousTrackIds: readonly number[]
  nextTrackIds: readonly number[]
  hasTrack: (id: number) => boolean
}): LibraryViewportRestoreAction {
  if (input.currentScrollGeneration !== input.captured.scrollGeneration) {
    return { type: 'no-op' }
  }

  if (areTrackIdSequencesEqual(input.previousTrackIds, input.nextTrackIds)) {
    return { type: 'keep-scroll-top', scrollTop: input.captured.scrollTop }
  }

  const firstVisibleTrackId = input.captured.firstVisibleTrackId
  if (firstVisibleTrackId !== null && input.hasTrack(firstVisibleTrackId)) {
    return { type: 'scroll-to-track', trackId: firstVisibleTrackId }
  }

  return { type: 'no-op' }
}

export function areTrackIdSequencesEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}
