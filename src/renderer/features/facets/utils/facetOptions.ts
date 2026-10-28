import type { TrackListItem } from '@shared/types/libraryScan'
import type { AlbumDetailRequest } from '@shared/types/albumDetail'
import {
  albumIdentityKey,
  resolveAlbumArtist,
  resolveAlbumTitle,
} from '@shared/utils/albumIdentity'
import { formatDelimitedValues } from '@shared/utils/delimitedValues'
import { SMART_PLAYLIST_NAME_MAX_LENGTH } from '@shared/smartPlaylists/ruleLimits'
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

export interface AlbumFacetOption extends AlbumDetailRequest {
  key: string
  label: string
  artistLabel: string
  trackCount: number
}

/** Keep the exact catalog identity so detail queries include the entire album. */
export function buildAlbumFacetOptions(
  tracks: readonly TrackListItem[],
  unknownAlbum: string,
  unknownArtist: string,
): AlbumFacetOption[] {
  const albums = new Map<string, AlbumFacetOption>()
  for (const track of tracks) {
    const albumArtist = resolveAlbumArtist(track)
    const albumTitle = resolveAlbumTitle(track)
    const key = albumIdentityKey(albumArtist, albumTitle)
    const existing = albums.get(key)
    if (existing) existing.trackCount++
    else {
      albums.set(key, {
        key,
        albumArtist,
        albumTitle,
        label: track.album || unknownAlbum,
        artistLabel: formatDelimitedValues(track.albumArtist || track.artist) || unknownArtist,
        trackCount: 1,
      })
    }
  }
  return [...albums.values()].sort(
    (left, right) =>
      collator.compare(left.label, right.label) ||
      collator.compare(left.artistLabel, right.artistLabel),
  )
}

export function buildFacetPlaylistName(labels: readonly string[]): string {
  // Avoid leaving half of an emoji at the UTF-16 limit enforced by IPC.
  return labels
    .join(' · ')
    .slice(0, SMART_PLAYLIST_NAME_MAX_LENGTH)
    .replace(/[\uD800-\uDBFF]$/u, '')
    .trim()
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
