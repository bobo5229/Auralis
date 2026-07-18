import type { TrackListItem } from '@shared/types/libraryScan'

import type { RoamAlbum } from '../types'

/**
 * Group tracks into roam albums using the same key rules as AlbumsPage:
 * `key = `${albumArtist}\0${title}``.
 *
 * Keeps the first `artworkCacheKey` seen per album, then **sorts by key**
 * so fingerprint and cell indices stay stable across reloads.
 */
export function groupRoamAlbums(tracks: TrackListItem[]): RoamAlbum[] {
  const grouped = new Map<string, RoamAlbum>()

  for (const track of tracks) {
    const albumArtist = track.albumArtist || track.artist || 'Unknown Artist'
    const title = track.album || 'Unknown Album'
    const key = `${albumArtist}\u0000${title}`
    const existing = grouped.get(key)

    if (existing) {
      existing.artworkCacheKey ??= track.artworkCacheKey
      continue
    }

    grouped.set(key, {
      key,
      title,
      albumArtist,
      artworkCacheKey: track.artworkCacheKey,
    })
  }

  return [...grouped.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}
