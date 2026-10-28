import type { TrackListItem } from '../types/libraryScan'
import { normalizeDelimitedValue, splitDelimitedValues } from './delimitedValues'

/** 按覆盖曲目数排序；单曲内去重，同频次保留首次出现顺序。 */
export function rankAlbumGenres(tracks: readonly Pick<TrackListItem, 'genre'>[]): string[] {
  const counts = new Map<string, { label: string; count: number; firstSeen: number }>()
  for (const track of tracks) {
    const trackGenres = new Map<string, string>()
    for (const genre of splitDelimitedValues(track.genre)) {
      trackGenres.set(normalizeDelimitedValue(genre), genre)
    }
    for (const [key, label] of trackGenres) {
      const existing = counts.get(key)
      if (existing) existing.count += 1
      else counts.set(key, { label, count: 1, firstSeen: counts.size })
    }
  }
  return [...counts.values()]
    .sort((left, right) => right.count - left.count || left.firstSeen - right.firstSeen)
    .map((genre) => genre.label)
}
