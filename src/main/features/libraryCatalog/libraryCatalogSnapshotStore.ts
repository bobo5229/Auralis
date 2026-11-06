import { performance } from 'node:perf_hooks'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { LoadedLibraryCatalog } from './libraryCatalogWorkerTypes'
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

interface CachedCatalogData {
  revision: string
  tracks: readonly TrackListItem[]
  lastAccessedAt: number
}

class CatalogLoadRequired extends Error {}

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
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null
  private disposed = false
  private cachedData: CachedCatalogData | null = null
  private pendingLoad: Promise<LoadedLibraryCatalog> | null = null

  constructor(
    private readonly loadTracks: () => TrackListItem[],
    private readonly now: () => number = Date.now,
    private readonly readRevision?: () => string,
  ) {}

  getPage(request: LibraryTrackPageRequest = {}): LibraryTrackPage {
    return this.readPage(request)
  }

  async getPageAsync(
    request: LibraryTrackPageRequest,
    load: () => Promise<LoadedLibraryCatalog>,
  ): Promise<LibraryTrackPage> {
    if (request.cursor !== undefined) return this.getPage(request)
    const deadline = Date.now() + 30_000
    for (;;) {
      if (this.disposed) throw new Error('Library catalog snapshot store is disposed')
      this.expireIdleSnapshots()
      this.scheduleCleanup()
      const revision = this.readRevision?.()
      const current = this.currentId ? this.snapshots.get(this.currentId) : undefined
      if (
        (current && (!request.refresh || (this.readRevision && current.revision === revision))) ||
        (revision !== undefined && this.cachedData?.revision === revision)
      ) {
        try {
          return this.readPage(request, undefined, false)
        } catch (error) {
          if (!(error instanceof CatalogLoadRequired)) throw error
          // TTL may expire while checking the revision. Reload asynchronously.
        }
      }
      if (!this.pendingLoad) {
        const pending = load().finally(() => {
          if (this.pendingLoad === pending) this.pendingLoad = null
        })
        this.pendingLoad = pending
      }
      const loaded = await this.pendingLoad
      if (this.disposed) throw new Error('Library catalog snapshot store is disposed')
      // A worker result describes one committed DB snapshot, never a mixture of revisions.
      if (this.readRevision && this.readRevision() !== loaded.revision) {
        if (Date.now() >= deadline) throw new Error('Library catalog kept changing during load')
        continue
      }
      return this.readPage(request, loaded, false)
    }
  }

  private readPage(
    request: LibraryTrackPageRequest,
    loaded?: LoadedLibraryCatalog,
    allowSyncLoad = true,
  ): LibraryTrackPage {
    if (this.disposed) throw new Error('Library catalog snapshot store is disposed')
    if (request.refresh && request.cursor !== undefined) {
      throw new Error('A refreshed library catalog page cannot also provide a cursor')
    }

    let snapshotBuildMs: number | null = null
    let snapshotHeapDeltaBytes: number | null = null
    let offset = 0

    // Validate cursors before cleanup/building; never reinterpret one as a first page.
    const cursor = request.cursor === undefined ? null : decodeCursor(request.cursor)
    this.expireIdleSnapshots()
    this.scheduleCleanup()
    let snapshot = this.currentId ? this.snapshots.get(this.currentId) : undefined
    const revision = cursor ? undefined : (loaded?.revision ?? this.readRevision?.())
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
      snapshot = this.createSnapshot(revision, loaded?.tracks, allowSyncLoad)
      this.currentId = snapshot.id
      this.snapshots.set(snapshot.id, snapshot)
      while (this.snapshots.size > LIBRARY_CATALOG_RETAINED_GENERATIONS) {
        this.snapshots.delete(this.snapshots.keys().next().value!)
      }
      snapshotBuildMs = performance.now() - startedAt
      snapshotHeapDeltaBytes = process.memoryUsage().heapUsed - heapUsedBefore
    }

    snapshot.lastAccessedAt = this.now()
    this.scheduleCleanup()
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
      libraryRevision: snapshot.revision,
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

  dispose(): void {
    this.disposed = true
    if (this.cleanupTimer) clearTimeout(this.cleanupTimer)
    this.cleanupTimer = null
    this.snapshots.clear()
    this.cachedData = null
    this.currentId = null
  }

  private expireIdleSnapshots(): void {
    const now = this.now()
    if (this.cachedData && now - this.cachedData.lastAccessedAt >= LIBRARY_CATALOG_DATA_IDLE_MS)
      this.cachedData = null
    for (const [id, retained] of this.snapshots) {
      if (now - retained.lastAccessedAt >= LIBRARY_CATALOG_IDLE_MS) {
        this.snapshots.delete(id)
        if (this.currentId === id) this.currentId = null
      }
    }
  }

  private scheduleCleanup(): void {
    if (this.cleanupTimer) clearTimeout(this.cleanupTimer)
    this.cleanupTimer = null
    let nextExpiration = Infinity
    if (this.cachedData)
      nextExpiration = this.cachedData.lastAccessedAt + LIBRARY_CATALOG_DATA_IDLE_MS
    for (const snapshot of this.snapshots.values()) {
      nextExpiration = Math.min(nextExpiration, snapshot.lastAccessedAt + LIBRARY_CATALOG_IDLE_MS)
    }
    if (!Number.isFinite(nextExpiration)) return
    this.cleanupTimer = setTimeout(
      () => {
        this.cleanupTimer = null
        this.expireIdleSnapshots()
        this.scheduleCleanup()
      },
      Math.max(0, nextExpiration - this.now()),
    )
    this.cleanupTimer.unref()
  }

  private createSnapshot(
    revision: string | undefined,
    loaded?: TrackListItem[],
    allowSyncLoad = true,
  ): LibraryCatalogSnapshot {
    this.snapshotSequence += 1
    let tracks: readonly TrackListItem[]
    if (revision !== undefined && this.cachedData?.revision === revision) {
      tracks = this.cachedData.tracks
      this.cachedData.lastAccessedAt = this.now()
    } else {
      if (!loaded && !allowSyncLoad) throw new CatalogLoadRequired()
      // Only the latest revision is cached, independently of the two cursor generations.
      this.cachedData = null
      tracks = Object.freeze(
        (loaded ?? this.loadTracks()).map((track) => Object.freeze({ ...track })),
      )
      if (revision !== undefined && tracks.length <= LIBRARY_CATALOG_DATA_MAX_TRACKS)
        this.cachedData = { revision, tracks, lastAccessedAt: this.now() }
    }
    return {
      revision,
      lastAccessedAt: this.now(),
      id: `${Date.now().toString(36)}-${this.snapshotSequence.toString(36)}`,
      tracks,
    }
  }
}

export const LIBRARY_CATALOG_RETAINED_GENERATIONS = 2
export const LIBRARY_CATALOG_IDLE_MS = 60_000
export const LIBRARY_CATALOG_DATA_IDLE_MS = 5 * 60_000
export const LIBRARY_CATALOG_DATA_MAX_TRACKS = 100_000
