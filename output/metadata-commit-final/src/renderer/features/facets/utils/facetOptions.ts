import type { TrackListItem } from '@shared/types/libraryScan'
import {
  getTrackFacetKey,
  getTrackFacetLabels,
  matchesTrackFacetKey,
  type TrackFacetKind,
} from '@shared/smartPlaylists/trackFacets'

const collator = new Intl.Collator('zh-Hans-u-co-pinyin', {
  numeric: true,
  sensitivity: 'base',
})

export type RuleFacetKind = TrackFacetKind
export interface FacetOption {
  key: string
  label: string
  value: string | null
  trackCount: number
}

export const getFacetKey = getTrackFacetKey
export const getFacetValues = getTrackFacetLabels
export const matchesFacet = matchesTrackFacetKey

export function buildFacetOptions(
  tracks: readonly TrackListItem[],
  kind: RuleFacetKind,
  unknownLabel: string,
): FacetOption[] {
  const counts = new Map<string, FacetOption>()
  for (const track of tracks) {
    for (const value of getTrackFacetLabels(track, kind)) {
      const key = getTrackFacetKey(value)
      const existing = counts.get(key)
      if (existing) existing.trackCount += 1
      else counts.set(key, { key, label: value ?? unknownLabel, value, trackCount: 1 })
    }
  }
  return [...counts.values()].sort((left, right) => collator.compare(left.label, right.label))
}
