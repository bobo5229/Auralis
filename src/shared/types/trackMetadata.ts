import type { TrackFileFingerprint } from './trackFile'

/** Actual normalized tags. Missing tags stay null; display fallbacks never enter this object. */
export type FileTagValues = {
  trackNo?: number | null
  trackTotal?: number | null
  discNo?: number | null
  discTotal?: number | null
  composer?: string | null
  copyright?: string | null
  isrc?: string | null
  title: string | null
  artistDisplay: string | null
  albumTitle: string | null
  albumArtistDisplay: string | null
  genreDisplay: string | null
  year: number | null
  releaseDate: string | null
}
export type ArtworkReadResult =
  | { status: 'present'; cacheKey: string }
  | { status: 'absent' }
  | { status: 'unread' }
  | { status: 'error' }

export interface FileMetadataSnapshot {
  directoryArtworkFingerprint?: string
  fileTags?: FileTagValues
  artworkRead?: ArtworkReadResult
  directoryArtworkCacheKey?: string | null
  fileFingerprint?: TrackFileFingerprint
}
