import type { TrackListItem } from '@shared/types/libraryScan'
import {
  cleanDelimitedValues,
  normalizeDelimitedValue,
  splitDelimitedValues,
} from '@shared/utils/delimitedValues'

/**
 * Facet value rules shared by the renderer facet preview and the main-process
 * smart-playlist evaluation. Both sides must decompose, normalize and match
 * track fields identically — including the album-artist→artist fallback and
 * the empty ("unknown") semantics.
 */

/** Query fields supported by smart-playlist expressions. */
export type TrackValueField = 'genre' | 'artist' | 'albumArtist' | 'albumArtistOrArtist'
/** Facet kinds offered by the facet dialog; albumArtist uses the artist fallback. */
export type TrackFacetKind = 'genre' | 'albumArtist'

export function getRawTrackValue(track: TrackListItem, field: TrackValueField): string | null {
  if (field === 'albumArtistOrArtist') return track.albumArtist || track.artist
  return track[field]
}

/** Normalized match values for a track field; empty means the facet is unknown/empty. */
export function getTrackFacetMatchValues(track: TrackListItem, field: TrackValueField): string[] {
  return splitDelimitedValues(getRawTrackValue(track, field)).map(normalizeDelimitedValue)
}

/** First-seen display labels for a facet (deduplicated, original casing); [null] when empty. */
export function getTrackFacetLabels(
  track: TrackListItem,
  kind: TrackFacetKind,
): Array<string | null> {
  const raw = getRawTrackValue(track, kind === 'genre' ? 'genre' : 'albumArtistOrArtist')
  const labels = cleanDelimitedValues([raw])
  return labels.length > 0 ? labels : [null]
}

export function getTrackFacetKey(value: string | null): string {
  return value === null ? 'unknown' : `value:${normalizeDelimitedValue(value)}`
}

export function matchesTrackFacetKey(
  track: TrackListItem,
  kind: TrackFacetKind,
  key: string,
): boolean {
  return getTrackFacetLabels(track, kind).some((value) => getTrackFacetKey(value) === key)
}
