import type { EditableTrackMetadata, TrackFileFingerprint } from './libraryScan'

/** Actual normalized tags. Missing tags stay null; display fallbacks never enter this object. */
export type FileTagValues = Pick<
  EditableTrackMetadata,
  | 'title'
  | 'artistDisplay'
  | 'albumTitle'
  | 'albumArtistDisplay'
  | 'genreDisplay'
  | 'year'
  | 'releaseDate'
>
export type EditableTagField = Exclude<keyof FileTagValues, 'year'>
export interface TrackMetadataEditSnapshot extends EditableTrackMetadata {
  editToken: string
  legacyMetadata?: EditableTrackMetadata
}
export interface UpdateTrackMetadataRequest {
  trackId: number
  editToken: string
  changes: Partial<Pick<FileTagValues, EditableTagField>>
  legacyAction?: 'adopt-file' | 'write-legacy'
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
