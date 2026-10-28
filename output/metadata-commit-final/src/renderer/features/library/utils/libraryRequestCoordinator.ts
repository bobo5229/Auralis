export type LibraryLoadMode = 'foreground' | 'background' | 'metadata-save'

export interface LibraryRequestCompletion {
  readonly ownedForeground: boolean
  readonly ownedBackground: boolean
  readonly ownedMetadataSave: boolean
  readonly shouldFlushBackground: boolean
}

/**
 * Owns request generations and the two blocking request lanes used by LibraryPage.
 * Route identity and UI side effects deliberately remain in the page.
 */
export class LibraryRequestCoordinator {
  private latestGeneration = 0
  private activeForegroundGeneration: number | null = null
  private activeBackgroundGeneration: number | null = null
  private activeMetadataSaveGeneration: number | null = null
  private pendingBackgroundRefresh = false
  private invalidated = false
  private foregroundIdleWaiters: Array<() => void> = []

  get hasActiveForeground(): boolean {
    return this.activeForegroundGeneration !== null
  }

  begin(mode: LibraryLoadMode): number | null {
    if (this.invalidated) return null

    if (
      mode === 'background' &&
      (this.activeForegroundGeneration !== null ||
        this.activeBackgroundGeneration !== null ||
        this.activeMetadataSaveGeneration !== null)
    ) {
      this.pendingBackgroundRefresh = true
      return null
    }

    this.latestGeneration += 1
    const generation = this.latestGeneration

    if (mode === 'foreground') {
      this.activeForegroundGeneration = generation
    } else if (mode === 'background') {
      this.pendingBackgroundRefresh = false
      this.activeBackgroundGeneration = generation
    } else if (mode === 'metadata-save') {
      this.pendingBackgroundRefresh = false
      this.activeMetadataSaveGeneration = generation
    }

    return generation
  }

  isLatest(generation: number): boolean {
    return !this.invalidated && generation === this.latestGeneration
  }

  waitForForegroundIdle(): Promise<void> {
    if (this.activeForegroundGeneration === null || this.invalidated) {
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      this.foregroundIdleWaiters.push(resolve)
    })
  }

  finish(generation: number): LibraryRequestCompletion {
    const ownedForeground = this.activeForegroundGeneration === generation
    const ownedBackground = this.activeBackgroundGeneration === generation
    const ownedMetadataSave = this.activeMetadataSaveGeneration === generation
    let foregroundWasAwaited = false

    if (ownedForeground) {
      this.activeForegroundGeneration = null
      foregroundWasAwaited = this.foregroundIdleWaiters.length > 0
      this.settleForegroundIdleWaiters()
    }

    if (ownedMetadataSave) {
      this.activeMetadataSaveGeneration = null
    }

    if (ownedBackground) {
      this.activeBackgroundGeneration = null
    }

    return {
      ownedForeground,
      ownedBackground,
      ownedMetadataSave,
      shouldFlushBackground: !foregroundWasAwaited && this.takePendingBackgroundRefreshIfReady(),
    }
  }

  takePendingBackgroundRefreshIfReady(): boolean {
    if (
      this.invalidated ||
      !this.pendingBackgroundRefresh ||
      this.activeForegroundGeneration !== null ||
      this.activeBackgroundGeneration !== null ||
      this.activeMetadataSaveGeneration !== null
    ) {
      return false
    }

    this.pendingBackgroundRefresh = false
    return true
  }

  invalidate(): void {
    this.invalidated = true
    this.latestGeneration += 1
    this.activeForegroundGeneration = null
    this.activeBackgroundGeneration = null
    this.activeMetadataSaveGeneration = null
    this.pendingBackgroundRefresh = false
    this.settleForegroundIdleWaiters()
  }

  private settleForegroundIdleWaiters(): void {
    const waiters = this.foregroundIdleWaiters
    this.foregroundIdleWaiters = []
    waiters.forEach((resolve) => resolve())
  }
}
