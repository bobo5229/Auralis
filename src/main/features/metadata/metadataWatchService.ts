import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { join, normalize } from 'node:path'
import { isSupportedAudioFile } from '@main/features/libraryScan/audioFileFilter'
import { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import { TrackRepository } from '@main/repositories/trackRepository'
import { logger } from '@main/logging/logger'
import type { MetadataRefreshService } from './metadataRefreshService'
import type { LibraryIncrementalImportService } from '../libraryScan/libraryIncrementalImportService'

const WATCH_DEBOUNCE_MS = 1200
const RETRY_AFTER_ACTIVE_JOB_MS = 5000
const UNSTABLE_RETRY_DELAY_MS = 3000
const MAX_UNSTABLE_RETRIES = 40 // ~2 min total (40 * 3s)

export class MetadataWatchService {
  private readonly watchers = new Map<string, FSWatcher>()
  private readonly pendingFilePaths = new Map<string, number>()
  private readonly unstableRetries = new Map<string, number>()
  private readonly inFlightFilePaths = new Set<string>()
  private readonly deferredFilePaths = new Set<string>()
  private flushTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly libraryRootRepository: LibraryRootRepository,
    private readonly trackRepository: TrackRepository,
    private readonly metadataRefreshService: MetadataRefreshService,
    private readonly incrementalImportService: LibraryIncrementalImportService,
  ) {}

  start(): void {
    this.syncRoots()
  }

  stop(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close()
    }

    this.watchers.clear()

    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
  }

  syncRoots(): void {
    const roots = this.libraryRootRepository.list()
    const nextRootPaths = new Set(roots.map((root) => normalize(root.path)))

    for (const rootPath of this.watchers.keys()) {
      if (!nextRootPaths.has(rootPath)) {
        this.watchers.get(rootPath)?.close()
        this.watchers.delete(rootPath)
      }
    }

    for (const rootPath of nextRootPaths) {
      if (this.watchers.has(rootPath)) {
        continue
      }

      this.watchRoot(rootPath)
    }
  }

  private watchRoot(rootPath: string): void {
    try {
      const watcher = watch(rootPath, { recursive: true }, (_eventType, filename) => {
        if (!filename) {
          return
        }

        const filePath = normalize(join(rootPath, filename.toString()))

        if (!isSupportedAudioFile(filePath)) {
          return
        }

        this.pendingFilePaths.set(filePath, Date.now())
        this.scheduleFlush()
      })

      watcher.on('error', (error) => {
        logger.warn({ error, rootPath }, 'Metadata watcher failed')
        watcher.close()
        this.watchers.delete(rootPath)
      })

      this.watchers.set(rootPath, watcher)
      logger.info({ rootPath }, 'Metadata watcher started')
    } catch (error) {
      logger.warn({ error, rootPath }, 'Unable to start metadata watcher')
    }
  }

  private scheduleFlush(delay = WATCH_DEBOUNCE_MS): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.flushPending()
    }, delay)
  }

  private flushPending(): void {
    const filePaths = [...this.pendingFilePaths.keys()]
    this.pendingFilePaths.clear()

    if (filePaths.length === 0) {
      return
    }

    // Separate in-flight paths into deferred set, don't put back into pending
    const incoming: string[] = []

    for (const filePath of filePaths) {
      if (this.inFlightFilePaths.has(filePath)) {
        this.deferredFilePaths.add(filePath)
      } else {
        incoming.push(filePath)
      }
    }

    if (incoming.length === 0) {
      return
    }

    const existingPaths = this.trackRepository.getExistingFilePaths(incoming)
    const existingFilePaths = incoming.filter((p) => existingPaths.has(p))
    const newFilePaths = incoming.filter((p) => !existingPaths.has(p))

    // Route existing tracks to metadata refresh
    if (existingFilePaths.length > 0) {
      const trackIds = this.trackRepository.getTrackIdsByFilePaths(existingFilePaths)

      if (trackIds.length > 0) {
        try {
          this.metadataRefreshService.refreshTracksFromFileChanges(trackIds)
        } catch (error) {
          this.requeuePaths(existingFilePaths)
          logger.info(
            { error, count: trackIds.length },
            'Deferring metadata refresh for file changes',
          )
          this.scheduleFlush(RETRY_AFTER_ACTIVE_JOB_MS)
        }
      }
    }

    // Route new tracks to incremental import
    if (newFilePaths.length > 0) {
      for (const filePath of newFilePaths) {
        this.inFlightFilePaths.add(filePath)
      }

      this.importWithRetry(newFilePaths)
    }
  }

  private async importWithRetry(filePaths: string[]): Promise<void> {
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
            this.pendingFilePaths.set(filePath, Date.now())
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
      this.pendingFilePaths.set(filePath, Date.now())
      this.scheduleFlush()
    }
  }

  private requeuePaths(filePaths: string[]): void {
    for (const filePath of filePaths) {
      this.pendingFilePaths.set(filePath, Date.now())
    }
  }
}
