export const PLAYBACK_CLOCK_EMPTY = '--:--'

export function formatPlaybackClock(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return PLAYBACK_CLOCK_EMPTY
  }

  const total = Math.floor(seconds)
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
