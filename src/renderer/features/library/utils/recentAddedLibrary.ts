import type { TrackListItem } from '@shared/types/libraryScan'

export const RECENT_ADDED_LIBRARY_RANGES = [7, 30, 90, 'all'] as const
// Keep day arithmetic within the range supported by JavaScript timestamps.
export const MAX_RECENT_ADDED_LIBRARY_DAYS = 100_000_000
export type RecentAddedLibraryRange = number | 'all'

export function parseRecentAddedLibraryRange(value: unknown): RecentAddedLibraryRange | null {
  if (value === 'all') return 'all'
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) {
    return null
  }
  const days = Number(value)
  return Number.isInteger(days) && days > 0 && days <= MAX_RECENT_ADDED_LIBRARY_DAYS ? days : null
}

export function parseRecentAddedLibraryTimestamp(value: string): number {
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
  return new Date(normalized).getTime()
}

export function selectRecentAddedLibraryTracks(
  tracks: readonly TrackListItem[],
  range: RecentAddedLibraryRange,
  nowMs = Date.now(),
): TrackListItem[] {
  const selected = tracks.map((track) => ({
    track,
    addedAt: parseRecentAddedLibraryTimestamp(track.createdAt),
  }))

  const start = range === 'all' ? Number.NEGATIVE_INFINITY : nowMs - range * 86_400_000

  const ordered = selected
    .filter(({ addedAt }) =>
      range === 'all' ? true : Number.isFinite(addedAt) && addedAt >= start && addedAt <= nowMs,
    )
    .sort((left, right) => {
      const leftValid = Number.isFinite(left.addedAt)
      const rightValid = Number.isFinite(right.addedAt)
      if (leftValid && rightValid) {
        return right.addedAt - left.addedAt || right.track.id - left.track.id
      }
      if (leftValid) return -1
      if (rightValid) return 1
      return right.track.id - left.track.id
    })
    .map(({ track }) => track)

  // Match the cover view's album identity and preserve newest-album-first order.
  const albums = new Map<string, TrackListItem[]>()
  for (const track of ordered) {
    const key = `${track.albumArtist || track.artist || ''}\u0000${track.album || ''}`
    const album = albums.get(key)
    if (album) album.push(track)
    else albums.set(key, [track])
  }

  return [...albums.values()].flatMap((album) =>
    album.sort(
      (left, right) =>
        (left.discNo ?? 1) - (right.discNo ?? 1) ||
        (left.trackNo ?? Number.MAX_SAFE_INTEGER) - (right.trackNo ?? Number.MAX_SAFE_INTEGER),
    ),
  )
}
