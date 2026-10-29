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
  | 'trackNo'
  | 'trackTotal'
  | 'discNo'
  | 'discTotal'
  | 'composer'
  | 'copyright'
  | 'isrc'
>
export interface MetadataFileSummary {
  fileName: string
  filePath: string
  format: string
  targetCount: number
}
export interface MetadataEditCapabilities {
  fields: Record<EditableTagField, boolean>
  datePrecisions: Array<'year' | 'month' | 'day'>
  artwork: boolean
}
export type EditableTagField = Exclude<keyof FileTagValues, 'year'>
export interface TrackMetadataEditSnapshot extends EditableTrackMetadata {
  editToken: string
  legacyMetadata?: EditableTrackMetadata
}
export interface UpdateTrackMetadataRequest {
  trackId: number
  editToken: string
  changes: Partial<Pick<FileTagValues, EditableTagField>>
  artworkChanges?: import('./metadataArtworkEdit').MetadataArtworkChange[]
  legacyAction?: 'adopt-file' | 'write-legacy' | 'apply-merged'
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
