import { normalizeAudioFilePath } from '@main/shared/normalizeAudioFilePath'
import { isSupportedAudioFile } from '@main/shared/audioFileFilter'
import type { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import type { TrackRepository } from '@main/repositories/trackRepository'
import { logger } from '@main/logging/logger'
import type { MetadataRefreshService } from './metadataRefreshService'
import { isLyricSidecar, resolveAudioCandidatesForLyricSidecar } from './lyricSidecarPaths'
import type { LibraryIncrementalImportService } from '../libraryScan/libraryIncrementalImportService'
import type { LibraryChangedEvent } from '@shared/types/libraryEvents'
import { MetadataWatchImportQueue } from './metadataWatchImportQueue'
import { MetadataRootWatchers } from './metadataRootWatchers'
import { MetadataMissingConfirmation } from './metadataMissingConfirmation'
import {
  createMetadataWatchState,
  observeWatchPath,
  retryWatchPath,
  watchPathDueAt,
} from './metadataWatchState'
import { MetadataWatchBatch } from './metadataWatchBatch'
import { MetadataWatchRecovery } from './metadataWatchRecovery'
import { MetadataWatchStatBudget, WATCH_STAT_BATCH_SIZE } from './metadataWatchStatBudget'
import { win32 } from 'node:path'
import type { DatabaseWriteAdmission } from '@main/database/databaseWriteAdmission'

export class MetadataWatchService {
  private readonly state = createMetadataWatchState()
  /** Watch work that may eventually write to the library database. */
  private readonly activeOperations = new Set<Promise<void>>()
  private readonly statBudget = new MetadataWatchStatBudget()
  private flushInFlight = false
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
    libraryChanged: (event: LibraryChangedEvent) => void,
    writeAdmission?: DatabaseWriteAdmission,
  ) {
    this.importQueue = new MetadataWatchImportQueue(
      incrementalImportService,
      (filePath, retryDelay) => {
        if (!this.isCurrentPath(filePath)) return
        if (retryDelay !== undefined) retryWatchPath(this.state, filePath, retryDelay)
        else observeWatchPath(this.state, filePath)
      },
      () => this.scheduleFlush(),
      (filePath) => this.isCurrentPath(filePath),
      writeAdmission ? () => this.state.rootsVersion : undefined,
    )
    this.rootWatchers = new MetadataRootWatchers(
      () => this.state.stopped,
      (path) => this.enqueueChangedPath(path),
      (rootPath, isCurrent) => this.recovery.enqueue(rootPath, isCurrent),
    )
    this.missingConfirmation = new MetadataMissingConfirmation(
      trackRepository,
      this.state.statRetries,
      libraryChanged,
      {
        isStopped: () => this.state.stopped,
        isPaused: () => this.state.flushPaused,
        isPathActive: (filePath) => this.isCurrentPath(filePath),
        runOperation: (operation) => this.runOperation(operation),
        rootsVersion: () => this.state.rootsVersion,
      },
      this.statBudget,
      writeAdmission,
    )
    this.batch = new MetadataWatchBatch(this.state, {
      writeAdmission,
      trackRepository,
      statBudget: this.statBudget,
      metadataRefreshService,
      importQueue: this.importQueue,
      missingConfirmation: this.missingConfirmation,
      isCurrentPath: (filePath) => this.isCurrentPath(filePath),
      scheduleFlush: () => this.scheduleFlush(),
    })
    this.recovery = new MetadataWatchRecovery(this.state, {
      trackRepository,
      statBudget: this.statBudget,
      runOperation: (operation) => this.runOperation(operation),
      flushPending: (paths) => this.batch.flushPending(paths),
    })
  }

  start(): void {
    this.syncRoots()
  }

  enqueueRestoredPaths(paths: readonly string[]): void {
    for (const path of paths) this.enqueueChangedPath(path, true)
  }

  async stop(): Promise<void> {
    this.state.stopped = true
    this.rootWatchers.close()
    this.recovery.clear()
    this.state.statRetries.clear()
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
    this.state.pendingExplicitRefreshPaths.clear()
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
      this.state.pendingExplicitRefreshPaths,
      this.state.statRetries,
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

  private enqueueChangedPath(filePath: string, forceRefresh = false): void {
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
        observeWatchPath(this.state, track.filePath)
        this.state.pendingExplicitRefreshPaths.add(track.filePath)
      }
      if (this.state.pendingFilePaths.size) this.scheduleFlush()
      return
    }
    if (isLyricSidecar(filePath)) {
      const audioCandidates = resolveAudioCandidatesForLyricSidecar(filePath)
      const knownAudioPaths = this.trackRepository.getExistingFilePaths(audioCandidates)

      for (const audioPath of knownAudioPaths) {
        if (!this.isCurrentPath(audioPath)) continue
        observeWatchPath(this.state, audioPath)
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

    observeWatchPath(this.state, filePath)
    if (forceRefresh) this.state.pendingExplicitRefreshPaths.add(filePath)
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (this.state.stopped || this.state.flushPaused || this.flushInFlight) return
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = null
    let dueAt = Infinity
    for (const entry of this.state.pendingFilePaths.values()) {
      dueAt = Math.min(dueAt, watchPathDueAt(entry))
    }
    if (!Number.isFinite(dueAt)) return
    this.flushTimer = setTimeout(
      () => {
        this.flushTimer = null
        const now = Date.now()
        const due: string[] = []
        for (const [filePath, entry] of this.state.pendingFilePaths) {
          if (watchPathDueAt(entry) <= now) due.push(filePath)
          if (due.length === WATCH_STAT_BATCH_SIZE) break
        }
        if (!due.length) {
          this.scheduleFlush()
          return
        }
        this.flushInFlight = true
        this.runOperation(async () => {
          try {
            await this.batch.flushPending(due)
          } finally {
            this.flushInFlight = false
            this.scheduleFlush()
          }
        })
      },
      Math.max(0, dueAt - Date.now()),
    )
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
