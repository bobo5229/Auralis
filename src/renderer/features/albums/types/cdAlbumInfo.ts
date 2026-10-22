import type { CdAlbum } from '../utils/cdStageController'
import type { TrackListItem } from '@shared/types/libraryScan'

export interface CdAlbumInfo extends CdAlbum {
  artworkCacheKey: string | null
  title: string
  artist: string
  releaseDate: string | null
  trackCount: number
  copyright: string | null
  tracks: TrackListItem[]
}
