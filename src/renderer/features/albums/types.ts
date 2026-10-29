import type { TrackListItem } from '@shared/types/libraryScan'

export interface AlbumSummary {
  key: string
  title: string
  albumArtist: string
  indexArtist?: string
  releaseDate: string | null
  artworkCacheKey: string | null
  tracks: TrackListItem[]
}
