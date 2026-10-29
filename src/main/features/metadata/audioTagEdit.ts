import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import type { EditableTagField } from '@shared/types/trackMetadata'
import type { TrackFileFingerprint } from '@shared/types/trackFile'

/** Internal write intent. The public metadata IPC does not accept lyricsText. */
export type AudioTagEdit = EditableTrackMetadata & {
  lyricsText?: string
  editedFields?: EditableTagField[]
  commitFileTags?: boolean
  expectedFingerprint?: TrackFileFingerprint
  expectedEditRevision?: string
  resolvedArtworkChanges?: import('./metadataArtworkEdits').ResolvedArtworkChange[]
  expectedArtwork?: import('./metadataArtworkEdits').ExpectedArtworkPicture[]
}
