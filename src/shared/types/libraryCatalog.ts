import type { TrackListItem } from './libraryScan'

export const LIBRARY_CATALOG_DEFAULT_PAGE_SIZE = 500
// A bounded 5k page keeps individual structured-clone payloads predictable
// while reducing a 100k catalog from 100 sequential IPC round-trips to 20.
export const LIBRARY_CATALOG_MAX_PAGE_SIZE = 5000

export interface LibraryTrackPageRequest {
  cursor?: string
  limit?: number
  refresh?: boolean
}

export interface LibraryTrackPageDiagnostics {
  snapshotBuildMs: number | null
  snapshotHeapDeltaBytes?: number | null
  pageSliceMs: number
}

export interface LibraryTrackPage {
  snapshotId: string
  totalTracks: number
  tracks: TrackListItem[]
  nextCursor: string | null
  diagnostics: LibraryTrackPageDiagnostics
}
