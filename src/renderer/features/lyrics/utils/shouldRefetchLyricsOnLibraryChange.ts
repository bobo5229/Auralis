export function shouldRefetchLyricsOnLibraryChange(input: {
  currentTrackId: number | null
  reason:
    | 'track-added'
    | 'track-missing'
    | 'track-restored'
    | 'track-relocated'
    | 'metadata-refresh'
    | 'file-change'
    | 'play-stats-updated'
    | 'play-stats-reset'
  trackIds: number[]
}): boolean {
  if (input.currentTrackId == null) return false
  if (!input.trackIds.includes(input.currentTrackId)) return false

  return (
    input.reason === 'track-added' ||
    input.reason === 'track-restored' ||
    input.reason === 'metadata-refresh' ||
    input.reason === 'file-change' ||
    input.reason === 'track-relocated'
  )
}
