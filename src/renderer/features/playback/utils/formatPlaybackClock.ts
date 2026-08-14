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

export function formatPlaybackClockPair(
  currentTime: number | null | undefined,
  duration: number | null | undefined,
  hasTrack: boolean,
): string {
  if (!hasTrack) {
    return `${PLAYBACK_CLOCK_EMPTY} / ${PLAYBACK_CLOCK_EMPTY}`
  }

  const end =
    duration == null || !Number.isFinite(duration) || duration <= 0
      ? PLAYBACK_CLOCK_EMPTY
      : formatPlaybackClock(duration)

  return `${formatPlaybackClock(currentTime)} / ${end}`
}
