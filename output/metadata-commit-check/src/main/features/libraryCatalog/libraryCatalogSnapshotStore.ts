import { performance } from 'node:perf_hooks'
import type { TrackListItem } from '@shared/types/libraryScan'
import {
  LIBRARY_CATALOG_DEFAULT_PAGE_SIZE,
  LIBRARY_CATALOG_MAX_PAGE_SIZE,
  LibraryCatalogExpiredError,
  type LibraryTrackPage,
  type LibraryTrackPageRequest,
} from '@shared/types/libraryCatalog'

interface LibraryCatalogSnapshot {
  readonly revision: string | undefined
  lastAccessedAt: number
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
 * Maintains bounded immutable, pinyin-sorted catalog generations in the main process.
 * Cursors address offsets inside that snapshot, so renderer paging cannot reorder
 * or duplicate tracks while the underlying database is changing.
 */
export class LibraryCatalogSnapshotStore {
  private snapshots = new Map<string, LibraryCatalogSnapshot>()
  private currentId: string | null = null
  private snapshotSequence = 0

  constructor(
    private readonly loadTracks: () => TrackListItem[],
    private readonly now: () => number = Date.now,
    private readonly readRevision?: () => string,
  ) {}

  getPage(request: LibraryTrackPageRequest = {}): LibraryTrackPage {
    if (request.refresh && request.cursor !== undefined) {
      throw new Error('A refreshed library catalog page cannot also provide a cursor')
    }

    let snapshotBuildMs: number | null = null
    let snapshotHeapDeltaBytes: number | null = null
    let offset = 0

    // Validate cursors before cleanup/building; never reinterpret one as a first page.
    const cursor = request.cursor === undefined ? null : decodeCursor(request.cursor)
    for (const [id, retained] of this.snapshots) {
      if (this.now() - retained.lastAccessedAt >= LIBRARY_CATALOG_IDLE_MS) {
        this.snapshots.delete(id)
      }
    }
    let snapshot = this.currentId ? this.snapshots.get(this.currentId) : undefined
    const revision = cursor ? undefined : this.readRevision?.()
    if (cursor) {
      snapshot = this.snapshots.get(cursor.snapshotId)
      if (!snapshot) throw new LibraryCatalogExpiredError()
      offset = cursor.offset
    } else if (
      !snapshot ||
      (request.refresh && (!this.readRevision || snapshot.revision !== revision))
    ) {
      const startedAt = performance.now()
      const heapUsedBefore = process.memoryUsage().heapUsed
      snapshot = this.createSnapshot(revision)
      this.currentId = snapshot.id
      this.snapshots.set(snapshot.id, snapshot)
      while (this.snapshots.size > LIBRARY_CATALOG_RETAINED_GENERATIONS) {
        this.snapshots.delete(this.snapshots.keys().next().value!)
      }
      snapshotBuildMs = performance.now() - startedAt
      snapshotHeapDeltaBytes = process.memoryUsage().heapUsed - heapUsedBefore
    }

    snapshot.lastAccessedAt = this.now()
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
        retainedSnapshots: this.snapshots.size,
        snapshotBuildMs,
        snapshotHeapDeltaBytes,
        pageSliceMs: performance.now() - pageStartedAt,
      },
    }
  }

  private createSnapshot(revision: string | undefined): LibraryCatalogSnapshot {
    this.snapshotSequence += 1
    return {
      revision,
      lastAccessedAt: this.now(),
      id: `${Date.now().toString(36)}-${this.snapshotSequence.toString(36)}`,
      tracks: Object.freeze(this.loadTracks().map((track) => Object.freeze({ ...track }))),
    }
  }
}

export const LIBRARY_CATALOG_RETAINED_GENERATIONS = 2
export const LIBRARY_CATALOG_IDLE_MS = 60_000
