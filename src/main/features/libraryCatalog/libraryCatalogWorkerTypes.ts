import type { TrackListItem } from '@shared/types/libraryScan'

export interface LoadedLibraryCatalog {
  revision: string
  tracks: TrackListItem[]
}

export type LibraryCatalogWorkerReply =
  | { id: number; catalog: LoadedLibraryCatalog }
  | { id: number; error: string }
