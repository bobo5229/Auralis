import { performance } from 'node:perf_hooks'
import type { TrackListItem } from '@shared/types/libraryScan'
import {
  LIBRARY_CATALOG_DEFAULT_PAGE_SIZE,
  LIBRARY_CATALOG_MAX_PAGE_SIZE,
  type LibraryTrackPage,
  type LibraryTrackPageRequest,
} from '@shared/types/libraryCatalog'

interface LibraryCatalogSnapshot {
  readonly id: string
  readonly tracks: readonly TrackListItem[]
}

interface LibraryCatalogCursor {
  readonly snapshotId: string
  readonly offset: number
}

function normalizePageSize(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return LIBRARY_CATALOG_DEFAULT_PAGE_SIZE
  }
  return Math.max(1, Math.min(LIBRARY_CATALOG_MAX_PAGE_SIZE, Math.trunc(limit)))
}

function encodeCursor(cursor: LibraryCatalogCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf-8').toString('base64url')
}

function decodeCursor(value: string): LibraryCatalogCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf-8')) as {
      snapshotId?: unknown
      offset?: unknown
    }
    if (
      typeof parsed.snapshotId !== 'string' ||
      !Number.isSafeInteger(parsed.offset) ||
      Number(parsed.offset) < 0
    ) {
      throw new Error('Invalid library catalog cursor payload')
    }
    return { snapshotId: parsed.snapshotId, offset: Number(parsed.offset) }
  } catch (error) {
    throw new Error('Invalid library catalog cursor', { cause: error })
  }
}

/**
 * Maintains one immutable, pinyin-sorted catalog snapshot in the main process.
 * Cursors address offsets inside that snapshot, so renderer paging cannot reorder
 * or duplicate tracks while the underlying database is changing.
 */
export class LibraryCatalogSnapshotStore {
  private snapshot: LibraryCatalogSnapshot | null = null
  private snapshotSequence = 0

  constructor(private readonly loadTracks: () => TrackListItem[]) {}

  getPage(request: LibraryTrackPageRequest = {}): LibraryTrackPage {
    if (request.refresh && request.cursor !== undefined) {
      throw new Error('A refreshed library catalog page cannot also provide a cursor')
    }

    let snapshotBuildMs: number | null = null
    let offset = 0

    if (request.refresh || this.snapshot === null) {
      const startedAt = performance.now()
      this.snapshot = this.createSnapshot()
      snapshotBuildMs = performance.now() - startedAt
    } else if (request.cursor !== undefined) {
      const cursor = decodeCursor(request.cursor)
      if (cursor.snapshotId !== this.snapshot.id) {
        throw new Error('Library catalog cursor refers to an expired snapshot')
      }
      offset = cursor.offset
    }

    const snapshot = this.snapshot
    const pageSize = normalizePageSize(request.limit)
    if (offset > snapshot.tracks.length) {
      throw new Error('Library catalog cursor offset exceeds snapshot size')
    }

    const pageStartedAt = performance.now()
    const tracks = snapshot.tracks.slice(offset, offset + pageSize)
    const nextOffset = offset + tracks.length
    const nextCursor =
      nextOffset < snapshot.tracks.length
        ? encodeCursor({ snapshotId: snapshot.id, offset: nextOffset })
        : null

    return {
      snapshotId: snapshot.id,
      totalTracks: snapshot.tracks.length,
      tracks,
      nextCursor,
      diagnostics: {
        snapshotBuildMs,
        pageSliceMs: performance.now() - pageStartedAt,
      },
    }
  }

  private createSnapshot(): LibraryCatalogSnapshot {
    this.snapshotSequence += 1
    return {
      id: `${Date.now().toString(36)}-${this.snapshotSequence.toString(36)}`,
      tracks: Object.freeze(this.loadTracks().slice()),
    }
  }
}
