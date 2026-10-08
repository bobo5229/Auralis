import { stat } from 'node:fs/promises'
import { extname, normalize } from 'node:path'
import { isSupportedAudioFile } from '@main/features/libraryScan/audioFileFilter'
import { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import { TrackRepository } from '@main/repositories/trackRepository'
import { logger } from '@main/logging/logger'
import type { MetadataRefreshService } from './metadataRefreshService'
import { resolveWatchRefreshPaths } from './metadataFileChangeFilter'
import { resolveAudioCandidatesForLyricSidecar } from './lyricSidecarPaths'
import type { LibraryIncrementalImportService } from '../libraryScan/libraryIncrementalImportService'
import type { RendererEventSender } from '@main/ipc/rendererEvents'
import { MetadataWatchImportQueue } from './metadataWatchImportQueue'
import { MetadataRootWatchers } from './metadataRootWatchers'
import { MetadataMissingConfirmation } from './metadataMissingConfirmation'
import { isTransientStatError } from './metadataWatchStatErrors'

const WATCH_DEBOUNCE_MS = 1200
const RETRY_AFTER_ACTIVE_JOB_MS = 5000
const UNSTABLE_RETRY_DELAY_MS = 3000
const MAX_STAT_RETRIES = 10
/** Suppress watch-triggered metadata refresh after a successful user tag write. */
const TAG_WRITE_REFRESH_SUPPRESS_MS = 8000

export class MetadataWatchService {
  private readonly pendingFilePaths = new Map<string, number>()
  /** Audio paths whose pending event came from a sidecar `.lrc` mapping. */
  private readonly pendingLyricsIntentPaths = new Set<string>()
  private readonly statRetries = new Map<string, number>()
  /** filePath → suppress refresh until epoch ms */
  private readonly suppressRefreshUntil = new Map<string, number>()
  /** Watch work that may eventually write to the library database. */
  private readonly activeOperations = new Set<Promise<void>>()
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private flushPaused = false
  private stopped = false

  private readonly importQueue: MetadataWatchImportQueue
  private readonly rootWatchers: MetadataRootWatchers
  private readonly missingConfirmation: MetadataMissingConfirmation

  constructor(
    private readonly libraryRootRepository: LibraryRootRepository,
    private readonly trackRepository: TrackRepository,
    private readonly metadataRefreshService: MetadataRefreshService,
    incrementalImportService: LibraryIncrementalImportService,
    sendToRenderer: RendererEventSender,
  ) {
    this.importQueue = new MetadataWatchImportQueue(
      incrementalImportService,
      (filePath) => {
        this.pendingFilePaths.set(filePath, Date.now())
      },
      (delay) => this.scheduleFlush(delay),
    )
    this.rootWatchers = new MetadataRootWatchers(
      () => this.stopped,
      (path) => this.enqueueChangedPath(path),
    )
    this.missingConfirmation = new MetadataMissingConfirmation(
      trackRepository,
      this.statRetries,
      sendToRenderer,
      {
        isStopped: () => this.stopped,
        isPaused: () => this.flushPaused,
        runOperation: (operation) => this.runOperation(operation),
      },
    )
  }

  start(): void {
    this.syncRoots()
  }

  async stop(): Promise<void> {
    this.stopped = true
    this.rootWatchers.close()
    this.statRetries.clear()
    this.suppressRefreshUntil.clear()
    this.flushPaused = true

    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    this.missingConfirmation.pause()
    while (this.activeOperations.size > 0) {
      await Promise.allSettled([...this.activeOperations])
    }
    this.pendingFilePaths.clear()
    this.missingConfirmation.clear()
    this.pendingLyricsIntentPaths.clear()
    this.importQueue.clearDeferred()
  }

  /**
   * Pause pending-file flush while a full library scan runs so watch imports
   * cannot race markMissingUnderRootExcept on scan complete.
   */
  async pauseFlush(): Promise<void> {
    this.flushPaused = true
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    this.missingConfirmation.pause()

    // A flush may already be past its initial pause check and waiting on file
    // I/O. Full scans must not start until all such work (including imports
    // spawned by that flush) has completed.
    while (this.activeOperations.size > 0) {
      await Promise.allSettled([...this.activeOperations])
    }
  }

  resumeFlush(): void {
    if (this.stopped) return
    this.flushPaused = false
    if (this.pendingFilePaths.size > 0) {
      this.scheduleFlush()
    }
    this.missingConfirmation.resume()
  }

  /**
   * After a successful tag write, ignore watch-driven metadata refresh for this
   * path briefly so the write mtime change cannot clobber user_edit via refresh.
   */
  suppressRefreshForPath(filePath: string, durationMs = TAG_WRITE_REFRESH_SUPPRESS_MS): void {
    const normalizedPath = normalize(filePath)
    this.suppressRefreshUntil.set(normalizedPath, Date.now() + durationMs)
    // Drop any already-queued refresh for this path.
    this.pendingFilePaths.delete(normalizedPath)
    this.pendingLyricsIntentPaths.delete(normalizedPath)
    this.importQueue.discardDeferred(normalizedPath)
  }

  private isRefreshSuppressed(filePath: string): boolean {
    const until = this.suppressRefreshUntil.get(normalize(filePath))
    if (until === undefined) {
      return false
    }
    if (Date.now() >= until) {
      this.suppressRefreshUntil.delete(normalize(filePath))
      return false
    }
    return true
  }

  syncRoots(): void {
    if (this.stopped) return
    this.rootWatchers.sync(this.libraryRootRepository.list().map((root) => root.path))
  }

  private enqueueChangedPath(filePath: string): void {
    if (extname(filePath).toLowerCase() === '.lrc') {
      const audioCandidates = resolveAudioCandidatesForLyricSidecar(filePath)
      const knownAudioPaths = this.trackRepository.getExistingFilePaths(audioCandidates)

      for (const audioPath of knownAudioPaths) {
        this.pendingFilePaths.set(audioPath, Date.now())
        this.pendingLyricsIntentPaths.add(audioPath)
      }

      if (knownAudioPaths.size > 0) {
        this.scheduleFlush()
      }
      return
    }

    if (!isSupportedAudioFile(filePath)) {
      return
    }

    this.pendingFilePaths.set(filePath, Date.now())
    this.scheduleFlush()
  }

  private scheduleFlush(delay = WATCH_DEBOUNCE_MS): void {
    if (this.stopped || this.flushPaused) {
      return
    }

    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.runOperation(() => this.flushPending())
    }, delay)
  }

  private runOperation(operation: () => Promise<void>): void {
    if (this.stopped) return
    const promise = operation().catch((error) => {
      logger.warn({ error }, 'Metadata watch operation failed')
    })
    this.activeOperations.add(promise)
    void promise.finally(() => this.activeOperations.delete(promise))
  }

  private async flushPending(): Promise<void> {
    if (this.flushPaused) {
      return
    }

    const filePaths = [...this.pendingFilePaths.keys()]
    this.pendingFilePaths.clear()

    if (filePaths.length === 0) {
      return
    }

    // Separate in-flight paths into deferred set
    const incoming: string[] = []

    for (const filePath of filePaths) {
      if (!this.importQueue.deferIfInFlight(filePath)) {
        incoming.push(filePath)
      }
    }

    if (incoming.length === 0) {
      return
    }

    // Stat all files to determine existence
    const statResults = await Promise.allSettled(incoming.map((p) => stat(p)))
    if (this.stopped) return
    const existingEntries: Array<{ filePath: string; size: number; mtimeMs: number }> = []
    const missingPaths: string[] = []
    const transientErrorPaths: string[] = []

    for (let i = 0; i < incoming.length; i++) {
      const result = statResults[i]

      if (result.status === 'fulfilled') {
        existingEntries.push({
          filePath: incoming[i],
          size: result.value.size,
          mtimeMs: result.value.mtimeMs,
        })
        this.statRetries.delete(incoming[i])
      } else if (isTransientStatError(result.reason)) {
        transientErrorPaths.push(incoming[i])
      } else {
        missingPaths.push(incoming[i])
      }
    }

    // Requeue transient errors for retry (with limit)
    if (transientErrorPaths.length > 0) {
      for (const filePath of transientErrorPaths) {
        const retries = (this.statRetries.get(filePath) ?? 0) + 1
        if (retries >= MAX_STAT_RETRIES) {
          this.statRetries.delete(filePath)
          logger.warn({ filePath, retries }, 'Dropping file after max stat retries')
        } else {
          this.statRetries.set(filePath, retries)
          this.pendingFilePaths.set(filePath, Date.now())
        }
      }
      this.scheduleFlush(UNSTABLE_RETRY_DELAY_MS)
    }

    // Route existing tracks
    if (existingEntries.length > 0) {
      const existingPaths = existingEntries.map((entry) => entry.filePath)
      const knownPaths = this.trackRepository.getExistingFilePaths(existingPaths)
      const knownEntries = existingEntries.filter((entry) => knownPaths.has(entry.filePath))
      const newFilePaths = existingEntries
        .filter((entry) => !knownPaths.has(entry.filePath))
        .map((entry) => entry.filePath)

      // Known tracks: refresh when the audio fingerprint changed, or when a
      // sidecar `.lrc` mapped this path into lyrics intent. Opening a file for
      // playback leaves size + mtime untouched and carries no lyrics intent, so
      // it must not create a refresh job. Tag-write suppression is applied
      // before this decision.
      const refreshCandidates = knownEntries.filter(
        (entry) => !this.isRefreshSuppressed(entry.filePath),
      )
      const fingerprints = this.trackRepository.getFileFingerprintsByFilePaths(
        refreshCandidates.map((entry) => entry.filePath),
      )
      const lyricsIntentPaths = refreshCandidates
        .map((entry) => entry.filePath)
        .filter((filePath) => this.pendingLyricsIntentPaths.has(filePath))
      const changedPaths = resolveWatchRefreshPaths({
        stats: refreshCandidates,
        fingerprints,
        lyricsIntentPaths,
      })

      if (changedPaths.length > 0) {
        const trackIds = this.trackRepository.getTrackIdsByFilePaths(changedPaths)

        if (trackIds.length > 0) {
          try {
            this.metadataRefreshService.refreshTracksFromFileChanges(trackIds)
          } catch (error) {
            this.requeuePaths(changedPaths)
            logger.info(
              { error, count: trackIds.length },
              'Deferring metadata refresh for file changes',
            )
            this.scheduleFlush(RETRY_AFTER_ACTIVE_JOB_MS)
          }
        }
      } else if (refreshCandidates.length > 0) {
        logger.debug(
          { count: refreshCandidates.length },
          'Metadata watcher: files unchanged since last scan, skipping refresh',
        )
      }

      // New tracks: import with relocation matching
      if (newFilePaths.length > 0) {
        await this.importQueue.importFiles(newFilePaths)
      }
    }

    // Route missing tracks to confirmation queue
    if (missingPaths.length > 0) {
      for (const filePath of missingPaths) {
        this.missingConfirmation.enqueue(filePath)
      }
    }

    // Drop lyrics intent for paths this batch finished. Deferred and
    // requeued (transient stat / refresh defer) paths keep their intent.
    for (const filePath of incoming) {
      if (!this.pendingFilePaths.has(filePath)) {
        this.pendingLyricsIntentPaths.delete(filePath)
      }
    }
  }

  private requeuePaths(filePaths: string[]): void {
    for (const filePath of filePaths) {
      this.pendingFilePaths.set(filePath, Date.now())
    }
  }
}
