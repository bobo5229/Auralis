import type { TrackListItem } from './libraryScan'

export const LIBRARY_CATALOG_DEFAULT_PAGE_SIZE = 500
export const LIBRARY_CATALOG_MAX_PAGE_SIZE = 1000

export interface LibraryTrackPageRequest {
  cursor?: string
  limit?: number
  refresh?: boolean
}

export interface LibraryTrackPageDiagnostics {
  snapshotBuildMs: number | null
  pageSliceMs: number
}

export interface LibraryTrackPage {
  snapshotId: string
  totalTracks: number
  tracks: TrackListItem[]
  nextCursor: string | null
  diagnostics: LibraryTrackPageDiagnostics
}
