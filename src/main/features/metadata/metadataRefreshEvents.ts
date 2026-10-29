import type { LibraryChangedEvent } from '@shared/types/libraryEvents'
import type { MetadataRefreshProgress } from './metadataRefreshTypes'

/** Business notifications; delivery to renderer windows belongs to the IPC adapter. */
export interface MetadataRefreshEvents {
  libraryChanged(event: LibraryChangedEvent): void
  refreshProgress(progress: MetadataRefreshProgress): void
  albumEditProgress?(progress: import('@shared/types/albumMetadataEdit').AlbumEditProgress): void
}
