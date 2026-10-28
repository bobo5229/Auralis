import type { DailyPlayCount } from '@shared/types/listeningArchive'

/** Newest local date with at least one effective play, or null when the year is silent. */
export function latestActiveDay(days: readonly DailyPlayCount[]): string | null {
  let latest: string | null = null
  for (const day of days) {
    if (day.playCount <= 0) continue
    if (latest === null || day.date > latest) latest = day.date
  }
  return latest
}
