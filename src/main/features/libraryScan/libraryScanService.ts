import { BrowserWindow, dialog } from 'electron'
import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { ipcChannels } from '@shared/ipc/channels'
import type {
  LibraryRoot,
  LibraryScanProgress,
  LibraryScanStatus,
  ScannedTrack,
  SelectLibraryRootResult,
} from '@shared/types/libraryScan'
import { logger } from '@main/logging/logger'
import { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import { ScanFailureRepository } from '@main/repositories/scanFailureRepository'
import { ScanJobRepository } from '@main/repositories/scanJobRepository'
import { TrackRepository } from '@main/repositories/trackRepository'
import type { LibraryScanWorkerInput, LibraryScanWorkerMessage } from './libraryScanTypes'
import { tryRelocateMissingCandidate } from './trackRelocationMatcher'

export class LibraryScanService {
  private readonly db: Database.Database
  private readonly libraryRootRepository: LibraryRootRepository
  private readonly scanJobRepository: ScanJobRepository
  private readonly scanFailureRepository: ScanFailureRepository
  private readonly trackRepository: TrackRepository
  private readonly artworkCacheDir: string
  private activeWorker: Worker | null = null
  private activeJobId: number | null = null
  private onScanLifecycle: {
    onStart?: () => void | Promise<void>
    onEnd?: () => void | Promise<void>
  } = {}

  constructor(db: Database.Database, artworkCacheDir: string) {
    this.db = db
    this.libraryRootRepository = new LibraryRootRepository(db)
    this.scanJobRepository = new ScanJobRepository(db)
    this.scanFailureRepository = new ScanFailureRepository(db)
    this.trackRepository = new TrackRepository(db)
    this.artworkCacheDir = artworkCacheDir
    this.scanJobRepository.markInterruptedJobs()
  }

  /**
   * Optional hooks so watch flush can pause during a full scan
   * (prevents watch-imported tracks from being markMissing'd on complete).
   */
  setScanLifecycleHooks(hooks: {
    onStart?: () => void | Promise<void>
    onEnd?: () => void | Promise<void>
  }): void {
    this.onScanLifecycle = hooks
  }

  async selectRoot(): Promise<SelectLibraryRootResult> {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory'],
      title: 'Choose Music Library Folder',
    })

    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true }
    }

    // The app manages a single library root. Atomically replace any
    // existing roots so old directories are no longer watched and their
    // tracks are marked missing (preserving play history, reversible).
    const root = this.db.transaction(() => {
      const existingRoots = this.libraryRootRepository.list()
      for (const oldRoot of existingRoots) {
        this.trackRepository.markMissingByPathPrefix(oldRoot.path)
        this.libraryRootRepository.deleteById(oldRoot.id)
      }
      return this.libraryRootRepository.upsertByPath(result.filePaths[0])
    })()

    return { canceled: false, root }
  }

  getRoots(): LibraryRoot[] {
    return this.libraryRootRepository.list()
  }

  getScanStatus(jobId?: number): LibraryScanStatus | null {
    return jobId ? this.scanJobRepository.getById(jobId) : this.scanJobRepository.getLatest()
  }

  async startScan(rootId: number): Promise<{ jobId: number }> {
    const activeJob = this.scanJobRepository.getActive()

    if (activeJob) {
      // This service still owns the job (it may be waiting for the async
      // lifecycle start hook before the worker is created) — return existing.
      if (this.activeJobId === activeJob.jobId) {
        return { jobId: activeJob.jobId }
      }

      // Orphan scanning row without a live worker — heal then start fresh.
      logger.warn(
        { jobId: activeJob.jobId },
        'Healing orphan scanning job without an active worker',
      )
      this.scanJobRepository.fail(
        activeJob.jobId,
        'Scan job recovered after unexpected interruption',
      )
      this.activeWorker = null
      this.activeJobId = null
      await this.onScanLifecycle.onEnd?.()
    }

    const root = this.libraryRootRepository.getById(rootId)

    if (!root) {
      throw new Error(`Library root not found: ${rootId}`)
    }

    const job = this.scanJobRepository.create(root.id)
    this.activeJobId = job.jobId

    try {
      await this.onScanLifecycle.onStart?.()
      this.startWorker(job.jobId, root.path)
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Failed to prepare library scan'
      this.scanJobRepository.fail(job.jobId, reason)
      this.activeJobId = null
      try {
        await this.onScanLifecycle.onEnd?.()
      } catch (lifecycleError) {
        logger.error({ error: lifecycleError, jobId: job.jobId }, 'Failed to end scan lifecycle')
      }
      throw error
    }

    return { jobId: job.jobId }
  }

  async cancelScan(jobId: number): Promise<{ ok: boolean }> {
    if (!this.activeWorker || this.activeJobId !== jobId) {
      return { ok: false }
    }

    // Clear state BEFORE terminate to prevent the exit handler from racing
    // and writing a 'failed' status that we would later overwrite to 'canceled'.
    const worker = this.activeWorker
    this.activeWorker = null
    this.activeJobId = null
    await worker.terminate()
    this.scanJobRepository.finish(jobId, 'canceled')
    try {
      await this.onScanLifecycle.onEnd?.()
    } catch (error) {
      logger.error({ error, jobId }, 'Failed to end canceled scan lifecycle')
    }
    const status = this.scanJobRepository.getById(jobId)

    if (status) {
      this.publishProgress({
        jobId,
        status: 'canceled',
        totalFiles: status.totalFiles,
        scannedFiles: status.scannedFiles,
        failedFiles: status.failedFiles,
        currentFile: null,
        message: 'Scan canceled',
      })
    }

    return { ok: true }
  }

  private startWorker(jobId: number, rootPath: string): void {
    const workerInput: LibraryScanWorkerInput = {
      jobId,
      rootPath,
      knownFiles: this.trackRepository.getKnownFiles(),
      artworkCacheDir: this.artworkCacheDir,
    }
    const workerPath = join(__dirname, 'features/libraryScan/libraryScanWorker.js')
    const worker = new Worker(workerPath, {
      workerData: workerInput,
    })

    this.activeWorker = worker
    // Terminal settlement and lifecycle cleanup are scoped to this worker so a
    // late event can neither settle twice nor clear a newer scan.
    let terminalSettled = false
    let lifecycleEndPromise: Promise<void> | null = null

    const endLifecycle = (): Promise<void> => {
      if (!lifecycleEndPromise) {
        lifecycleEndPromise = Promise.resolve()
          .then(() => this.onScanLifecycle.onEnd?.())
          .catch((error) => {
            logger.error({ error, jobId }, 'Failed to end library scan lifecycle')
          })
      }

      return lifecycleEndPromise
    }

    const clearWorkerState = (): void => {
      if (this.activeWorker === worker) {
        this.activeWorker = null
      }
      if (this.activeJobId === jobId) {
        this.activeJobId = null
        void endLifecycle()
      }
    }

    const settleFailed = (reason: string, error?: unknown): void => {
      if (terminalSettled) {
        return
      }

      terminalSettled = true
      logger.error({ error, jobId }, reason)

      try {
        this.scanJobRepository.fail(jobId, reason)
        const status = this.scanJobRepository.getById(jobId)
        this.publishProgress({
          jobId,
          status: 'failed',
          totalFiles: status?.totalFiles ?? 0,
          scannedFiles: status?.scannedFiles ?? 0,
          failedFiles: status?.failedFiles ?? 0,
          currentFile: null,
          message: reason,
        })
      } catch (settlementError) {
        logger.error({ error: settlementError, jobId }, 'Failed to persist scan failure status')
      } finally {
        clearWorkerState()
      }
    }

    worker.on('message', (message: LibraryScanWorkerMessage) => {
      if (terminalSettled || this.activeWorker !== worker || this.activeJobId !== jobId) {
        return
      }

      const isTerminal = message.type === 'complete' || message.type === 'fatal'

      try {
        this.handleWorkerMessage(message, jobId)
        if (isTerminal) {
          terminalSettled = true
          clearWorkerState()
        }
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : 'Unknown error while processing worker message'
        settleFailed(`Failed to finalize library scan: ${reason}`, error)
      }
    })

    worker.on('error', (error) => {
      settleFailed(error.message, error)
    })

    worker.on('exit', (code) => {
      // Defer so any already-queued terminal message handlers run first.
      setImmediate(() => {
        if (terminalSettled || this.activeJobId !== jobId) {
          return
        }

        const reason =
          code === 0
            ? 'Worker exited without completing the scan'
            : `Worker exited with code ${code}`
        settleFailed(reason)
      })
    })
  }

  private handleWorkerMessage(message: LibraryScanWorkerMessage, workerJobId: number): void {
    if (message.type === 'progress') {
      const progress = message.payload
      this.scanJobRepository.updateProgress(
        progress.jobId,
        progress.totalFiles,
        progress.scannedFiles,
        progress.failedFiles,
      )
      this.publishProgress(progress)
      return
    }

    if (message.type === 'tracks') {
      this.upsertOrRelocateTracks(message.payload)
      return
    }

    if (message.type === 'albumArtwork') {
      this.trackRepository.patchAlbumArtwork(message.payload)
      return
    }

    if (message.type === 'trackLyrics') {
      this.trackRepository.patchLyrics(message.payload)
      return
    }

    if (message.type === 'failure') {
      this.scanFailureRepository.insertMany([message.payload])
      return
    }

    if (message.type === 'fatal') {
      this.scanJobRepository.fail(workerJobId, message.payload.reason)
      const status = this.scanJobRepository.getById(workerJobId)
      this.publishProgress({
        jobId: workerJobId,
        status: 'failed',
        totalFiles: status?.totalFiles ?? 0,
        scannedFiles: status?.scannedFiles ?? 0,
        failedFiles: status?.failedFiles ?? 1,
        currentFile: null,
        message: message.payload.reason,
      })
      return
    }

    if (message.type === 'complete') {
      const result = this.db.transaction(() => {
        const status = this.scanJobRepository.getById(workerJobId)

        if (!status || status.status !== 'scanning') {
          return null
        }

        const root = this.libraryRootRepository.getById(status.rootId)
        if (!root) {
          throw new Error(`Library root not found while completing scan: ${status.rootId}`)
        }

        this.libraryRootRepository.markScanned(status.rootId)
        const restoredIds = this.trackRepository.markAvailableByFilePaths(
          message.payload.foundFilePaths,
        )
        const missingIds = this.trackRepository.markMissingUnderRootExcept(
          root.path,
          message.payload.foundFilePaths,
          message.payload.unreadableDirectoryPaths,
        )

        if (!this.scanJobRepository.finish(workerJobId, 'completed')) {
          throw new Error(`Scan job was no longer active while completing: ${workerJobId}`)
        }

        return { status, restoredIds, missingIds }
      })()

      if (!result) {
        return
      }

      if (result.restoredIds.length > 0) {
        this.publishChanged('track-restored', result.restoredIds, message.payload.foundFilePaths)
      }

      if (result.missingIds.length > 0) {
        this.publishChanged('track-missing', result.missingIds)
      }

      this.publishProgress({
        jobId: workerJobId,
        status: 'completed',
        totalFiles: result.status.totalFiles,
        scannedFiles: result.status.scannedFiles,
        failedFiles: result.status.failedFiles,
        currentFile: null,
        message: 'Scan completed',
      })
    }
  }

  private upsertOrRelocateTracks(tracks: ScannedTrack[]): void {
    const newTracks: ScannedTrack[] = []
    const relocatedIds: number[] = []

    for (const track of tracks) {
      try {
        const match = tryRelocateMissingCandidate(this.trackRepository, track)

        if (match) {
          const relocated = this.trackRepository.relocateTrack(match.candidate.trackId, track)

          if (relocated) {
            relocatedIds.push(match.candidate.trackId)
          } else {
            // Path occupied or constraint race — fall back to path upsert.
            newTracks.push(track)
          }
        } else {
          newTracks.push(track)
        }
      } catch (error) {
        logger.warn(
          { error, filePath: track.filePath },
          'Failed to relocate/upsert scanned track; trying upsert fallback',
        )
        newTracks.push(track)
      }
    }

    if (newTracks.length > 0) {
      const newTrackPaths = newTracks.map((track) => track.filePath)
      const existingPaths = this.trackRepository.getExistingFilePaths(newTrackPaths)
      const addedPaths = newTrackPaths.filter((filePath) => !existingPaths.has(filePath))

      try {
        this.trackRepository.upsertMany(newTracks)
      } catch (error) {
        // One bad row must not drop the whole batch — retry per track.
        logger.warn({ error, count: newTracks.length }, 'Batch upsert failed; retrying per track')
        for (const track of newTracks) {
          try {
            this.trackRepository.upsertMany([track])
          } catch (trackError) {
            logger.warn(
              { error: trackError, filePath: track.filePath },
              'Skipping track after upsert failure',
            )
          }
        }
      }

      if (addedPaths.length > 0) {
        const addedIds = this.trackRepository.getTrackIdsByFilePaths(addedPaths)
        this.publishChanged('track-added', addedIds, addedPaths)
      }
    }

    if (relocatedIds.length > 0) {
      this.publishChanged('track-relocated', relocatedIds)
    }
  }

  private publishProgress(progress: LibraryScanProgress): void {
    for (const window of BrowserWindow.getAllWindows()) {
      try {
        if (!window.webContents.isDestroyed()) {
          window.webContents.send(ipcChannels.library.scanProgress, progress)
        }
      } catch (error) {
        logger.warn({ error, jobId: progress.jobId }, 'Failed to publish scan progress')
      }
    }
  }

  private publishChanged(
    reason: 'track-added' | 'track-missing' | 'track-restored' | 'track-relocated',
    trackIds: number[],
    filePaths: string[] = [],
  ): void {
    for (const window of BrowserWindow.getAllWindows()) {
      try {
        if (!window.webContents.isDestroyed()) {
          window.webContents.send(ipcChannels.library.changed, {
            reason,
            trackIds,
            filePaths,
          })
        }
      } catch (error) {
        logger.warn({ error, reason }, 'Failed to publish library change')
      }
    }
  }
}
