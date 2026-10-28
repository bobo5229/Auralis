import type { TrackListItem } from './libraryScan'

export interface AlbumDetailRequest {
  albumArtist: string
  albumTitle: string
}

export interface AlbumDetailSummary {
  title: string
  albumArtist: string
  releaseDate: string | null
  artworkCacheKey: string | null
}

export interface AlbumDetailResult {
  tracks: TrackListItem[]
  moreAlbums: AlbumDetailSummary[]
  genreAlbums: AlbumDetailSummary[]
}
