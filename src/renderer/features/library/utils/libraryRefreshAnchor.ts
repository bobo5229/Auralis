/**
 * Picks the track that a background library refresh restores the viewport to.
 * The real viewport anchor (first visible track) must win over keyboard focus
 * and playback state: playing a track writes `keyboardFocusTrackId`, and a
 * background refresh must preserve the user's current viewport instead of
 * yanking it back to the played track. Later candidates only fill in when
 * earlier ones are missing or stale in the refreshed list.
 */
export function resolveLibraryRefreshAnchorTrackId(input: {
  candidates: Array<number | null>
  hasTrack: (id: number) => boolean
}): number | null {
  return (
    input.candidates.find((candidate) => candidate !== null && input.hasTrack(candidate)) ?? null
  )
}
