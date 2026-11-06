import type { TrackListItem } from '@shared/types/libraryScan'
import type { AlbumSummary } from '@shared/types/albumSummary'
import {
  albumIdentityKey,
  resolveAlbumArtist,
  resolveAlbumTitle,
} from '@shared/utils/albumIdentity'
import { normalizeDelimitedValue, splitDelimitedValues } from '@shared/utils/delimitedValues'
import { rankAlbumGenres } from '@shared/utils/albumGenres'

export function selectAlbumTracks(
  tracks: readonly TrackListItem[],
  albumArtist: string,
  albumTitle: string,
): TrackListItem[] {
  return tracks
    .filter((track) => {
      return resolveAlbumArtist(track) === albumArtist && resolveAlbumTitle(track) === albumTitle
    })
    .sort(compareAlbumTracks)
}

/** Disc, track number and title order shared by album and journal entries. */
export function compareAlbumTracks(left: TrackListItem, right: TrackListItem): number {
  const discOrder = (left.discNo ?? 1) - (right.discNo ?? 1)
  if (discOrder !== 0) return discOrder

  const trackOrder =
    (left.trackNo ?? Number.MAX_SAFE_INTEGER) - (right.trackNo ?? Number.MAX_SAFE_INTEGER)
  if (trackOrder !== 0) return trackOrder

  return (left.title ?? '').localeCompare(right.title ?? '') || left.id - right.id
}

export function groupAlbums(tracks: readonly TrackListItem[]): AlbumSummary[] {
  const groupedAlbums = new Map<string, AlbumSummary & { tracks: TrackListItem[] }>()

  for (const track of tracks) {
    const albumArtist = resolveAlbumArtist(track)
    const title = resolveAlbumTitle(track)
    const key = albumIdentityKey(albumArtist, title)
    const existing = groupedAlbums.get(key)

    if (existing) {
      existing.releaseDate = minimumAlbumValue(existing.releaseDate, track.releaseDate)
      existing.artworkCacheKey = minimumAlbumValue(
        existing.artworkCacheKey,
        track.artworkCacheKey || null,
      )
      existing.tracks.push(track)
      continue
    }

    groupedAlbums.set(key, {
      key,
      title,
      albumArtist,
      releaseDate: track.releaseDate,
      artworkCacheKey: track.artworkCacheKey || null,
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

export function sortAlbumsByYearThenTitle(albums: readonly AlbumSummary[]): AlbumSummary[] {
  return [...albums].sort((left, right) => {
    const leftYear = albumYearSortKey(left.releaseDate)
    const rightYear = albumYearSortKey(right.releaseDate)
    if (leftYear !== rightYear) return leftYear - rightYear
    return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
  })
}

export function moreAlbumsByArtist(
  albums: readonly AlbumSummary[],
  albumArtist: string,
  albumTitle: string,
): AlbumSummary[] {
  if (!albumArtist || albumArtist === 'Unknown Artist') return []
  const currentKey = albumIdentityKey(albumArtist, albumTitle)
  return sortAlbumsByYearThenTitle(
    albums.filter((album) => album.albumArtist === albumArtist && album.key !== currentKey),
  )
}

export function moreAlbumsByGenre(
  albums: readonly AlbumSummary[],
  currentTracks: readonly TrackListItem[],
  albumArtist: string,
  albumTitle: string,
): AlbumSummary[] {
  const primaryGenre = rankAlbumGenres(currentTracks)[0]
  if (!primaryGenre) return []
  const genreKey = normalizeDelimitedValue(primaryGenre)
  const currentKey = albumIdentityKey(albumArtist, albumTitle)
  return albums.filter(
    (album) =>
      album.key !== currentKey &&
      album.tracks.some((track) =>
        splitDelimitedValues(track.genre).some(
          (genre) => normalizeDelimitedValue(genre) === genreKey,
        ),
      ),
  )
}

/** Matches SQLite MIN; artwork callers exclude empty cache keys. */
export function minimumAlbumValue(left: string | null, right: string | null): string | null {
  if (left === null) return right
  if (right === null) return left
  return left < right ? left : right
}
