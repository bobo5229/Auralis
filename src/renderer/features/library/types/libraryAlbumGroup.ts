import type { TrackListItem } from '@shared/types/libraryScan'

export interface LibraryAlbumGroup {
  key: string
  album: string | null
  albumArtist: string | null
  releaseDate: string | null
  artworkCacheKey: string | null
  tracks: TrackListItem[]
  firstTrackIndex: number
}
