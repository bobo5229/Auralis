export interface PendingWatchPath {
  firstObservedAt: number
  lastObservedAt: number
  notBefore: number
}

const WATCH_DEBOUNCE_MS = 1200
// Bound sustained event streams while retaining per-path stability checks downstream.
const WATCH_MAX_WAIT_MS = 5000

export function watchPathDueAt(entry: PendingWatchPath): number {
  return Math.max(
    Math.min(entry.lastObservedAt + WATCH_DEBOUNCE_MS, entry.firstObservedAt + WATCH_MAX_WAIT_MS),
    entry.notBefore,
  )
}

export function observeWatchPath(
  state: MetadataWatchState,
  filePath: string,
  now = Date.now(),
): void {
  const pending = state.pendingFilePaths.get(filePath)
  if (pending) pending.lastObservedAt = now
  else
    state.pendingFilePaths.set(filePath, {
      firstObservedAt: now,
      lastObservedAt: now,
      notBefore: 0,
    })
}

export function retryWatchPath(
  state: MetadataWatchState,
  filePath: string,
  delay: number,
  now = Date.now(),
): void {
  const pending = state.pendingFilePaths.get(filePath)
  if (pending) pending.notBefore = Math.max(pending.notBefore, now + delay)
  else
    state.pendingFilePaths.set(filePath, {
      firstObservedAt: now,
      lastObservedAt: now,
      notBefore: now + delay,
    })
}

/** Shared observations and lifecycle flags; owned once by MetadataWatchService. */
export interface MetadataWatchState {
  readonly pendingFilePaths: Map<string, PendingWatchPath>
  /** Audio paths whose pending event came from a lyric sidecar mapping. */
  readonly pendingLyricsIntentPaths: Set<string>
  readonly pendingExplicitRefreshPaths: Set<string>
  /** Shared with missing confirmation so retries keep the same budget. */
  readonly statRetries: Map<string, number>
  flushPaused: boolean
  stopped: boolean
  rootsVersion: number
}

export function createMetadataWatchState(): MetadataWatchState {
  return {
    pendingFilePaths: new Map(),
    pendingLyricsIntentPaths: new Set(),
    pendingExplicitRefreshPaths: new Set(),
    statRetries: new Map(),
    flushPaused: false,
    stopped: false,
    rootsVersion: 0,
  }
}
