import type { EditableTrackMetadata } from '@shared/types/libraryScan'

/** Internal write intent. The public metadata IPC does not accept lyricsText. */
export type AudioTagEdit = EditableTrackMetadata & { lyricsText?: string }
