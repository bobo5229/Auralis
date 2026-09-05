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
  readonly snapshotHeapDeltaBytes: number
  readonly pageSliceMs: number
  readonly pageRoundTripMs: number
  readonly rendererAggregateMs: number
  readonly rendererLoadMs: number
  readonly rendererHeapDeltaBytes: number | null
}

interface ChromiumPerformanceMemory {
  readonly usedJSHeapSize: number
}

function readRendererHeapUsed(): number | null {
  const memory = (performance as Performance & { memory?: ChromiumPerformanceMemory }).memory
  return typeof memory?.usedJSHeapSize === 'number' ? memory.usedJSHeapSize : null
}

/** Aggregate bounded IPC pages into the behavior-compatible renderer snapshot. */
export async function loadLibraryCatalogSnapshot(
  fetchPage: (request: LibraryTrackPageRequest) => Promise<LibraryTrackPage>,
  isCurrent: () => boolean,
): Promise<LoadedLibraryCatalogSnapshot> {
  const loadStartedAt = performance.now()
  const heapUsedBefore = readRendererHeapUsed()
  let tracks: TrackListItem[] | null = null
  let writeOffset = 0
  let cursor: string | undefined
  let snapshotId: string | null = null
  let expectedTotal: number | null = null
  let totalPages = 0
  let snapshotBuildMs = 0
  let snapshotHeapDeltaBytes = 0
  let pageSliceMs = 0
  let pageRoundTripMs = 0
  let rendererAggregateMs = 0

  do {
    if (!isCurrent()) throw new LibraryCatalogLoadStaleError()

    const pageRequestStartedAt = performance.now()
    const page = await fetchPage({
      cursor,
      limit: LIBRARY_CATALOG_MAX_PAGE_SIZE,
      refresh: cursor === undefined,
    })
    pageRoundTripMs += performance.now() - pageRequestStartedAt

    if (!isCurrent()) throw new LibraryCatalogLoadStaleError()

    if (snapshotId === null) {
      snapshotId = page.snapshotId
      expectedTotal = page.totalTracks
      tracks = new Array<TrackListItem>(expectedTotal)
    } else if (page.snapshotId !== snapshotId || page.totalTracks !== expectedTotal) {
      throw new Error('Library catalog snapshot changed while loading pages')
    }

    const aggregateStartedAt = performance.now()
    if (tracks === null || writeOffset + page.tracks.length > tracks.length) {
      throw new Error('Library catalog page count exceeds snapshot total')
    }
    for (let pageIndex = 0; pageIndex < page.tracks.length; pageIndex += 1) {
      tracks[writeOffset + pageIndex] = page.tracks[pageIndex]
    }
    writeOffset += page.tracks.length
    rendererAggregateMs += performance.now() - aggregateStartedAt
    totalPages += 1
    snapshotBuildMs += page.diagnostics.snapshotBuildMs ?? 0
    snapshotHeapDeltaBytes += page.diagnostics.snapshotHeapDeltaBytes ?? 0
    pageSliceMs += page.diagnostics.pageSliceMs
    cursor = page.nextCursor ?? undefined
  } while (cursor)

  if (
    snapshotId === null ||
    expectedTotal === null ||
    tracks === null ||
    writeOffset !== expectedTotal
  ) {
    throw new Error('Library catalog page count does not match snapshot total')
  }

  const heapUsedAfter = readRendererHeapUsed()
  return {
    snapshotId,
    tracks,
    totalPages,
    snapshotBuildMs,
    snapshotHeapDeltaBytes,
    pageSliceMs,
    pageRoundTripMs,
    rendererAggregateMs,
    rendererLoadMs: performance.now() - loadStartedAt,
    rendererHeapDeltaBytes:
      heapUsedBefore === null || heapUsedAfter === null ? null : heapUsedAfter - heapUsedBefore,
  }
}
