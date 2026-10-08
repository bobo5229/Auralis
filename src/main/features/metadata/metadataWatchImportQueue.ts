import type { LibraryIncrementalImportService } from '../libraryScan/libraryIncrementalImportService'
import { logger } from '@main/logging/logger'

const UNSTABLE_RETRY_DELAY_MS = 3000
const MAX_UNSTABLE_RETRIES = 40 // ~2 min total (40 * 3s)

export class MetadataWatchImportQueue {
  private readonly unstableRetries = new Map<string, number>()
  private readonly inFlightFilePaths = new Set<string>()
  private readonly deferredFilePaths = new Set<string>()

  constructor(
    private readonly incrementalImportService: LibraryIncrementalImportService,
    private readonly onPending: (filePath: string) => void,
    private readonly scheduleFlush: (delay?: number) => void,
  ) {}

  deferIfInFlight(filePath: string): boolean {
    if (!this.inFlightFilePaths.has(filePath)) return false
    this.deferredFilePaths.add(filePath)
    return true
  }

  discardDeferred(filePath: string): void {
    this.deferredFilePaths.delete(filePath)
  }

  clearDeferred(): void {
    this.deferredFilePaths.clear()
  }

  async importFiles(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) this.inFlightFilePaths.add(filePath)
    try {
      const result = await this.incrementalImportService.importFiles(filePaths)

      // Release in-flight and drain deferred for imported files
      for (const filePath of result.imported) {
        this.unstableRetries.delete(filePath)
        this.releaseInFlight(filePath)
      }

      // Release in-flight and drain deferred for permanently failed files
      for (const failure of result.failed) {
        this.unstableRetries.delete(failure.filePath)
        this.releaseInFlight(failure.filePath)
      }

      // Handle unstable files: release in-flight first, then requeue for retry
      if (result.unstable.length > 0) {
        for (const filePath of result.unstable) {
          // Release in-flight before requeue so the next flush won't defer it
          this.inFlightFilePaths.delete(filePath)

          const retries = (this.unstableRetries.get(filePath) ?? 0) + 1

          if (retries >= MAX_UNSTABLE_RETRIES) {
            this.unstableRetries.delete(filePath)
            this.drainDeferred(filePath)
            logger.warn({ filePath, retries }, 'Dropping unstable file after max retries')
          } else {
            this.unstableRetries.set(filePath, retries)
            this.onPending(filePath)
          }
        }

        this.scheduleFlush(UNSTABLE_RETRY_DELAY_MS)
      }
    } catch (error) {
      // Release all in-flight on unexpected error and drain deferred
      for (const filePath of filePaths) {
        this.releaseInFlight(filePath)
      }
      logger.warn({ error, count: filePaths.length }, 'Incremental import failed')
    }
  }

  /**
   * Release a path from in-flight and re-add any deferred events for it to pending.
   */
  private releaseInFlight(filePath: string): void {
    this.inFlightFilePaths.delete(filePath)
    this.drainDeferred(filePath)
  }

  /**
   * If a path was deferred while in-flight, move it to pending and schedule a flush.
   */
  private drainDeferred(filePath: string): void {
    if (this.deferredFilePaths.delete(filePath)) {
      this.onPending(filePath)
      this.scheduleFlush()
    }
  }
}
