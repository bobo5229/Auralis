export type LibraryChangedReason =
  | 'track-added'
  | 'track-missing'
  | 'track-restored'
  | 'track-relocated'
  | 'metadata-refresh'
  | 'file-change'
  | 'play-stats-updated'
  | 'play-stats-reset'

export interface LibraryChangedEvent {
  reason: LibraryChangedReason
  trackIds: number[]
  filePaths: string[]
  /** Public catalog version after a verified metadata commit; not a write transaction token. */
  libraryRevision?: string
  /** Local day written to listening history for a newly recorded effective play. */
  playDate?: string
}
