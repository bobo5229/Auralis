export function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return ''

  const totalSeconds = Math.floor(seconds)
  const hours = Math.floor(totalSeconds / 3600)
  const mins = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  const parts = hours > 0 ? [hours, mins, secs] : [mins, secs]
  return parts.map((value) => String(value).padStart(2, '0')).join(':')
}
