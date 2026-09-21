import type { TrackListItem } from '@shared/types/libraryScan'
import type { AlbumSummary } from './types'

export interface AlbumDetailSnapshot {
  albumArtist: string
  albumTitle: string
  artworkCacheKey: string | null
  releaseDate: string | null
  tracks: TrackListItem[]
  moreAlbums: AlbumSummary[]
  catalogTracks: TrackListItem[] | null
}

let snapshot: AlbumDetailSnapshot | null = null

export function writeAlbumDetailSnapshot(next: AlbumDetailSnapshot): void {
  snapshot = next
}

export function readAlbumDetailSnapshot(
  albumArtist: string,
  albumTitle: string,
): AlbumDetailSnapshot | null {
  if (!snapshot) return null
  if (snapshot.albumArtist !== albumArtist || snapshot.albumTitle !== albumTitle) return null
  return snapshot
}

export function invalidateAlbumDetailSnapshot(): void {
  snapshot = null
}

export function snapshotHasCatalog(snapshotValue: AlbumDetailSnapshot | null): boolean {
  return Boolean(snapshotValue?.catalogTracks && snapshotValue.catalogTracks.length > 0)
}
