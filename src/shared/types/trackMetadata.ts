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
export interface EditableTrackMetadata extends FileTagValues {
  /** Editor-only transport state, never persisted as tag values. */
  editToken?: string
  legacyMetadata?: EditableTrackMetadata
  legacyAction?: 'adopt-file' | 'write-legacy' | 'apply-merged'
  artworkChanges?: import('./metadataArtworkEdit').MetadataArtworkChange[]
  fileSummary?: MetadataFileSummary
  capabilities?: MetadataEditCapabilities
  trackId: number
}
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
