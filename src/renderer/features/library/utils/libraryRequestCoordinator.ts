export type LibraryLoadMode = 'foreground' | 'background'

export interface LibraryRequestCompletion {
  readonly ownedForeground: boolean
  readonly ownedBackground: boolean
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
  private pendingBackgroundRefresh = false
  private invalidated = false

  begin(mode: LibraryLoadMode): number | null {
    if (this.invalidated) return null

    if (
      mode === 'background' &&
      (this.activeForegroundGeneration !== null || this.activeBackgroundGeneration !== null)
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
    }

    return generation
  }

  isLatest(generation: number): boolean {
    return !this.invalidated && generation === this.latestGeneration
  }

  finish(generation: number): LibraryRequestCompletion {
    const ownedForeground = this.activeForegroundGeneration === generation
    const ownedBackground = this.activeBackgroundGeneration === generation

    if (ownedForeground) {
      this.activeForegroundGeneration = null
    }

    if (ownedBackground) {
      this.activeBackgroundGeneration = null
    }

    return {
      ownedForeground,
      ownedBackground,
      shouldFlushBackground: this.takePendingBackgroundRefreshIfReady(),
    }
  }

  takePendingBackgroundRefreshIfReady(): boolean {
    if (
      this.invalidated ||
      !this.pendingBackgroundRefresh ||
      this.activeForegroundGeneration !== null ||
      this.activeBackgroundGeneration !== null
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
    this.pendingBackgroundRefresh = false
  }
}
