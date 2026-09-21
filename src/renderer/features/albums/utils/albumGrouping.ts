import type { TrackListItem } from '@shared/types/libraryScan'
import type { AlbumSummary } from '../types'
import { albumIdentityKey, resolveAlbumArtist, resolveAlbumTitle } from './albumIdentity'

export function selectAlbumTracks(
  tracks: TrackListItem[],
  albumArtist: string,
  albumTitle: string,
): TrackListItem[] {
  return tracks
    .filter((track) => {
      return resolveAlbumArtist(track) === albumArtist && resolveAlbumTitle(track) === albumTitle
    })
    .sort((left, right) => {
      const discOrder = (left.discNo ?? 1) - (right.discNo ?? 1)
      if (discOrder !== 0) return discOrder

      const trackOrder =
        (left.trackNo ?? Number.MAX_SAFE_INTEGER) - (right.trackNo ?? Number.MAX_SAFE_INTEGER)
      if (trackOrder !== 0) return trackOrder

      return (left.title ?? '').localeCompare(right.title ?? '')
    })
}

export function groupAlbums(tracks: TrackListItem[]): AlbumSummary[] {
  const groupedAlbums = new Map<string, AlbumSummary>()

  for (const track of tracks) {
    const albumArtist = resolveAlbumArtist(track)
    const title = resolveAlbumTitle(track)
    const key = albumIdentityKey(albumArtist, title)
    const existing = groupedAlbums.get(key)

    if (existing) {
      existing.releaseDate ??= track.releaseDate
      existing.artworkCacheKey ??= track.artworkCacheKey
      existing.tracks.push(track)
      continue
    }

    groupedAlbums.set(key, {
      key,
      title,
      albumArtist,
      releaseDate: track.releaseDate,
      artworkCacheKey: track.artworkCacheKey,
      tracks: [track],
    })
  }

  return [...groupedAlbums.values()]
}

export function albumYearSortKey(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY
  const year = Number(value.slice(0, 4))
  return Number.isFinite(year) ? year : Number.POSITIVE_INFINITY
}

export function sortAlbumsByYearThenTitle(albums: AlbumSummary[]): AlbumSummary[] {
  return [...albums].sort((left, right) => {
    const yearOrder = albumYearSortKey(left.releaseDate) - albumYearSortKey(right.releaseDate)
    if (yearOrder !== 0) return yearOrder
    return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
  })
}

export function moreAlbumsByArtist(
  albums: AlbumSummary[],
  albumArtist: string,
  albumTitle: string,
): AlbumSummary[] {
  if (!albumArtist || albumArtist === 'Unknown Artist') return []
  const currentKey = albumIdentityKey(albumArtist, albumTitle)
  return sortAlbumsByYearThenTitle(
    albums.filter((album) => album.albumArtist === albumArtist && album.key !== currentKey),
  )
}
