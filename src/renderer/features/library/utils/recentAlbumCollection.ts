import type { TrackListItem } from '@shared/types/libraryScan'
import type { AlbumSummary } from '@shared/types/albumSummary'
import { getAlbumCatalogIndex } from '@renderer/shared/catalog/albumCatalogIndex'
import {
  parseRecentAddedLibraryTimestamp,
  type RecentAddedLibraryRange,
} from './recentAddedLibrary'

export interface RecentAlbum extends AlbumSummary {
  addedAt: number | null
  latestTrackId: number
}

/** Range membership uses the newest addition, but album actions retain the complete album. */
export function recentAlbumCollection(tracks: TrackListItem[]): RecentAlbum[] {
  return getAlbumCatalogIndex(tracks)
    .albums.map((album) => {
      let addedAt: number | null = null
      let latestTrackId = 0
      for (const track of album.tracks) {
        const time = parseRecentAddedLibraryTimestamp(track.createdAt)
        if (Number.isFinite(time) && (addedAt === null || time > addedAt)) {
          addedAt = time
          latestTrackId = track.id
        } else if (time === addedAt || (addedAt === null && !Number.isFinite(time))) {
          latestTrackId = Math.max(latestTrackId, track.id)
        }
      }
      return { ...album, addedAt, latestTrackId }
    })
    .sort(
      (a, b) =>
        (b.addedAt ?? -Infinity) - (a.addedAt ?? -Infinity) || b.latestTrackId - a.latestTrackId,
    )
}

export function filterRecentAlbums(
  albums: readonly RecentAlbum[],
  range: RecentAddedLibraryRange,
  now: number,
): RecentAlbum[] {
  if (range === 'all') return [...albums]
  const start = now - range * 86_400_000
  return albums.filter(
    (album) => album.addedAt !== null && album.addedAt >= start && album.addedAt <= now,
  )
}

export function groupRecentAlbumMonths(
  albums: readonly RecentAlbum[],
): { key: string; date: number | null; albums: RecentAlbum[] }[] {
  const groups = new Map<string, { key: string; date: number | null; albums: RecentAlbum[] }>()
  for (const album of albums) {
    const date = album.addedAt === null ? null : new Date(album.addedAt)
    const key = date ? `${date.getFullYear()}-${date.getMonth()}` : 'undated'
    let group = groups.get(key)
    if (!group) {
      group = { key, date: album.addedAt, albums: [] }
      groups.set(key, group)
    }
    group.albums.push(album)
  }
  return [...groups.values()]
}
