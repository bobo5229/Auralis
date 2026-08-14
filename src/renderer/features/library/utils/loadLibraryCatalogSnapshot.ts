import {
  LIBRARY_CATALOG_MAX_PAGE_SIZE,
  type LibraryTrackPage,
  type LibraryTrackPageRequest,
} from '@shared/types/libraryCatalog'
import type { TrackListItem } from '@shared/types/libraryScan'

export class LibraryCatalogLoadStaleError extends Error {
  constructor() {
    super('Library catalog load became stale')
    this.name = 'LibraryCatalogLoadStaleError'
  }
}

export interface LoadedLibraryCatalogSnapshot {
  readonly snapshotId: string
  readonly tracks: TrackListItem[]
  readonly totalPages: number
  readonly snapshotBuildMs: number
  readonly pageSliceMs: number
  readonly rendererLoadMs: number
}

/** Aggregate bounded IPC pages into the behavior-compatible renderer snapshot. */
export async function loadLibraryCatalogSnapshot(
  fetchPage: (request: LibraryTrackPageRequest) => Promise<LibraryTrackPage>,
  isCurrent: () => boolean,
): Promise<LoadedLibraryCatalogSnapshot> {
  const loadStartedAt = performance.now()
  const tracks: TrackListItem[] = []
  let cursor: string | undefined
  let snapshotId: string | null = null
  let expectedTotal: number | null = null
  let totalPages = 0
  let snapshotBuildMs = 0
  let pageSliceMs = 0

  do {
    if (!isCurrent()) throw new LibraryCatalogLoadStaleError()

    const page = await fetchPage({
      cursor,
      limit: LIBRARY_CATALOG_MAX_PAGE_SIZE,
      refresh: cursor === undefined,
    })

    if (!isCurrent()) throw new LibraryCatalogLoadStaleError()

    if (snapshotId === null) {
      snapshotId = page.snapshotId
      expectedTotal = page.totalTracks
    } else if (page.snapshotId !== snapshotId || page.totalTracks !== expectedTotal) {
      throw new Error('Library catalog snapshot changed while loading pages')
    }

    tracks.push(...page.tracks)
    totalPages += 1
    snapshotBuildMs += page.diagnostics.snapshotBuildMs ?? 0
    pageSliceMs += page.diagnostics.pageSliceMs
    cursor = page.nextCursor ?? undefined
  } while (cursor)

  if (snapshotId === null || expectedTotal === null || tracks.length !== expectedTotal) {
    throw new Error('Library catalog page count does not match snapshot total')
  }

  return {
    snapshotId,
    tracks,
    totalPages,
    snapshotBuildMs,
    pageSliceMs,
    rendererLoadMs: performance.now() - loadStartedAt,
  }
}
