import type { LibraryScanProgress } from '@shared/types/libraryScan'
import type { LibraryChangedEvent } from '@shared/types/libraryEvents'

export interface LibraryScanEvents {
  progress(progress: LibraryScanProgress): void
  changed(event: LibraryChangedEvent): void
}
