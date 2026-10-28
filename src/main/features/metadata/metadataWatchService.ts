import { normalizeAudioFilePath } from '@main/shared/normalizeAudioFilePath'
import { isSupportedAudioFile } from '@main/shared/audioFileFilter'
import type { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import type { TrackRepository } from '@main/repositories/trackRepository'
import { logger } from '@main/logging/logger'
import type { MetadataRefreshService } from './metadataRefreshService'
import { isLyricSidecar, resolveAudioCandidatesForLyricSidecar } from './lyricSidecarPaths'
import type { LibraryIncrementalImportService } from '../libraryScan/libraryIncrementalImportService'
import type { RendererEventSender } from '@main/ipc/rendererEvents'
import { MetadataWatchImportQueue } from './metadataWatchImportQueue'
import { MetadataRootWatchers } from './metadataRootWatchers'
import { MetadataMissingConfirmation } from './metadataMissingConfirmation'
import { createMetadataWatchState } from './metadataWatchState'
import { MetadataWatchBatch } from './metadataWatchBatch'
import { MetadataWatchRecovery } from './metadataWatchRecovery'
import { win32 } from 'node:path'

const WATCH_DEBOUNCE_MS = 1200
/** Suppress watch-triggered metadata refresh after a successful user tag write. */
const TAG_WRITE_REFRESH_SUPPRESS_MS = 8000

export class MetadataWatchService {
  private readonly state = createMetadataWatchState()
  /** Watch work that may eventually write to the library database. */
  private readonly activeOperations = new Set<Promise<void>>()
  private flushTimer: ReturnType<typeof setTimeout> | null = null

  private readonly importQueue: MetadataWatchImportQueue
  private readonly rootWatchers: MetadataRootWatchers
  private readonly missingConfirmation: MetadataMissingConfirmation
  private readonly batch: MetadataWatchBatch
  private readonly recovery: MetadataWatchRecovery

  constructor(
    private readonly libraryRootRepository: LibraryRootRepository,
    private readonly trackRepository: TrackRepository,
    metadataRefreshService: MetadataRefreshService,
    incrementalImportService: LibraryIncrementalImportService,
    sendToRenderer: RendererEventSender,
  ) {
    this.importQueue = new MetadataWatchImportQueue(
      incrementalImportService,
      (filePath) => {
        if (!this.isCurrentPath(filePath)) return
        this.state.pendingFilePaths.set(filePath, Date.now())
      },
      (delay) => this.scheduleFlush(delay),
      (filePath) => this.isCurrentPath(filePath),
    )
    this.rootWatchers = new MetadataRootWatchers(
      () => this.state.stopped,
      (path) => this.enqueueChangedPath(path),
      (rootPath, isCurrent) => this.recovery.enqueue(rootPath, isCurrent),
    )
    this.missingConfirmation = new MetadataMissingConfirmation(
      trackRepository,
      this.state.statRetries,
      sendToRenderer,
      {
        isStopped: () => this.state.stopped,
        isPathBusy: (filePath) => metadataRefreshService.isWritingFile?.(filePath) ?? false,
        isPaused: () => this.state.flushPaused,
        isPathActive: (filePath) => this.isCurrentPath(filePath),
        runOperation: (operation) => this.runOperation(operation),
      },
    )
    this.batch = new MetadataWatchBatch(this.state, {
      trackRepository,
      metadataRefreshService,
      importQueue: this.importQueue,
      missingConfirmation: this.missingConfirmation,
      isCurrentPath: (filePath) => this.isCurrentPath(filePath),
      scheduleFlush: (delay) => this.scheduleFlush(delay),
      hasScheduledFlush: () => this.flushTimer !== null,
    })
    this.recovery = new MetadataWatchRecovery(this.state, {
      trackRepository,
      runOperation: (operation) => this.runOperation(operation),
      flushPending: (paths) => this.batch.flushPending(paths),
    })
  }

  start(): void {
    this.syncRoots()
  }

  async stop(): Promise<void> {
    this.state.stopped = true
    this.rootWatchers.close()
    this.recovery.clear()
    this.state.statRetries.clear()
    this.state.suppressRefreshUntil.clear()
    this.state.flushPaused = true

    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    this.missingConfirmation.pause()
    while (this.activeOperations.size > 0) {
      await Promise.allSettled([...this.activeOperations])
    }
    this.state.pendingFilePaths.clear()
    this.missingConfirmation.clear()
    this.state.pendingLyricsIntentPaths.clear()
    this.state.pendingArtworkIntentPaths.clear()
    this.importQueue.clearDeferred()
  }

  /**
   * Pause pending-file flush while a full library scan runs so watch imports
   * cannot race markMissingUnderRootExcept on scan complete.
   */
  async pauseFlush(): Promise<void> {
    this.state.flushPaused = true
    this.recovery.pause()
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
    if (this.state.stopped) return
    this.state.flushPaused = false
    if (this.state.pendingFilePaths.size > 0) {
      this.scheduleFlush()
    }
    this.missingConfirmation.resume()
    this.recovery.resume()
  }

  /**
   * After a successful tag write, ignore watch-driven metadata refresh for this
   * path briefly so the write mtime change cannot clobber user_edit via refresh.
   */
  suppressRefreshForPath(filePath: string, durationMs = TAG_WRITE_REFRESH_SUPPRESS_MS): void {
    const normalizedPath = normalizeAudioFilePath(filePath)
    this.state.suppressRefreshUntil.set(normalizedPath, Date.now() + durationMs)
    // Keep both file events and sidecar intent: suppression delays reconciliation
    // but cannot discard external changes observed around the tag write.
  }

  syncRoots(): void {
    if (this.state.stopped) return
    if (this.rootWatchers.sync(this.libraryRootRepository.list().map((root) => root.path))) {
      this.state.rootsVersion++
    }
    // A root transition keeps observations belonging to retained/nested roots,
    // but must discard every kind of work accepted from removed roots.
    for (const paths of [
      this.state.pendingFilePaths,
      this.state.pendingLyricsIntentPaths,
      this.state.pendingArtworkIntentPaths,
      this.state.statRetries,
      this.state.suppressRefreshUntil,
    ]) {
      for (const filePath of paths.keys()) {
        if (!this.isCurrentPath(filePath)) paths.delete(filePath)
      }
    }
    this.missingConfirmation.pruneInactivePaths()
    this.importQueue.pruneInactivePaths()
    this.recovery.pruneInactiveRoots()
    if (this.state.pendingFilePaths.size === 0 && this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
  }

  private isCurrentPath(filePath: string): boolean {
    return !this.state.stopped && this.rootWatchers.containsPath(filePath)
  }

  private enqueueChangedPath(filePath: string): void {
    if (!this.isCurrentPath(filePath)) return
    if (win32.basename(filePath).toLowerCase() === 'cover.jpg') {
      const directory = win32.dirname(filePath)
      const normalized = normalizeAudioFilePath(directory)
      const tracks = this.trackRepository.getWatchRecoveryTracks(directory)
      for (const track of tracks) {
        if (
          normalizeAudioFilePath(win32.dirname(track.filePath)) !== normalized ||
          !this.isCurrentPath(track.filePath)
        )
          continue
        this.state.pendingFilePaths.set(track.filePath, Date.now())
        this.state.pendingArtworkIntentPaths.add(track.filePath)
      }
      if (this.state.pendingFilePaths.size) this.scheduleFlush()
      return
    }
    if (isLyricSidecar(filePath)) {
      const audioCandidates = resolveAudioCandidatesForLyricSidecar(filePath)
      const knownAudioPaths = this.trackRepository.getExistingFilePaths(audioCandidates)

      for (const audioPath of knownAudioPaths) {
        if (!this.isCurrentPath(audioPath)) continue
        this.state.pendingFilePaths.set(audioPath, Date.now())
        this.state.pendingLyricsIntentPaths.add(audioPath)
      }

      if (knownAudioPaths.size > 0) {
        this.scheduleFlush()
      }
      return
    }

    if (!isSupportedAudioFile(filePath)) {
      return
    }

    this.state.pendingFilePaths.set(filePath, Date.now())
    this.scheduleFlush()
  }

  private scheduleFlush(delay = WATCH_DEBOUNCE_MS): void {
    if (this.state.stopped || this.state.flushPaused) {
      return
    }

    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      this.runOperation(() => this.batch.flushPending())
    }, delay)
  }

  private runOperation(operation: () => Promise<void>): void {
    if (this.state.stopped) return
    const promise = operation().catch((error) => {
      logger.warn({ error }, 'Metadata watch operation failed')
    })
    this.activeOperations.add(promise)
    void promise.finally(() => this.activeOperations.delete(promise))
  }
}
