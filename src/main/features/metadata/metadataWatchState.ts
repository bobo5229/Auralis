/** Shared observations and lifecycle flags; owned once by MetadataWatchService. */
export interface MetadataWatchState {
  readonly pendingFilePaths: Map<string, number>
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
