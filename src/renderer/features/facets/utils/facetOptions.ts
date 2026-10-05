import type { TrackListItem } from '@shared/types/libraryScan'
import { cleanDelimitedValues, normalizeDelimitedValue } from '@shared/utils/delimitedValues'

const collator = new Intl.Collator('zh-Hans-u-co-pinyin', {
  numeric: true,
  sensitivity: 'base',
})

export type RuleFacetKind = 'genre' | 'albumArtist'
export interface FacetOption {
  key: string
  label: string
  value: string | null
  trackCount: number
}

export function getFacetKey(value: string | null): string {
  return value === null ? 'unknown' : `value:${normalizeDelimitedValue(value)}`
}

export function getFacetValues(track: TrackListItem, kind: RuleFacetKind): Array<string | null> {
  // Match legacy smart-playlist rules, including the album-artist fallback.
  const raw = kind === 'genre' ? track.genre : track.albumArtist || track.artist
  const values = cleanDelimitedValues([raw])
  return values.length ? values : [null]
}

export function matchesFacet(track: TrackListItem, kind: RuleFacetKind, key: string): boolean {
  return getFacetValues(track, kind).some((value) => getFacetKey(value) === key)
}

export function buildFacetOptions(
  tracks: readonly TrackListItem[],
  kind: RuleFacetKind,
  unknownLabel: string,
): FacetOption[] {
  const counts = new Map<string, FacetOption>()
  for (const track of tracks) {
    for (const value of getFacetValues(track, kind)) {
      const key = getFacetKey(value)
      const existing = counts.get(key)
      if (existing) existing.trackCount += 1
      else counts.set(key, { key, label: value ?? unknownLabel, value, trackCount: 1 })
    }
  }
  return [...counts.values()].sort((left, right) => collator.compare(left.label, right.label))
}
