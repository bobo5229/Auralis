import { BrowserWindow, dialog } from 'electron'
import { Worker, type WorkerOptions } from 'node:worker_threads'
import { join, win32 } from 'node:path'
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
import { MissingTrackCleanupRepository } from '@main/repositories/missingTrackCleanupRepository'
import type { LibraryScanWorkerInput, LibraryScanWorkerMessage } from './libraryScanTypes'
import { findUniqueRelocations } from './trackRelocationMatcher'
import { createRendererEventSender, type RendererEventSender } from '@main/ipc/rendererEvents'

export type LibraryScanWorkerFactory = (fileName: string, options: WorkerOptions) => Worker

interface ImportedTracks {
  addedPaths: string[]
  relocatedIds: number[]
  relocatedPaths: string[]
}

function isUnderDirectory(filePath: string, directory: string): boolean {
  const relative = win32.relative(directory, filePath)
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith('..\\') && !win32.isAbsolute(relative))
  )
}

export class LibraryScanService {
  private readonly db: Database.Database
  private readonly libraryRootRepository: LibraryRootRepository
  private readonly scanJobRepository: ScanJobRepository
  private readonly scanFailureRepository: ScanFailureRepository
  private readonly trackRepository: TrackRepository
  private readonly artworkCacheDir: string
  private readonly createWorker: LibraryScanWorkerFactory
  private readonly sendToRenderer: RendererEventSender
  private activeWorker: Worker | null = null
  private activeJobId: number | null = null
  private readonly pendingNewTracks = new Map<string, ScannedTrack>()
  private scanHadFailures = false
  private stopping = false
  private readonly pendingStarts = new Set<Promise<{ jobId: number }>>()
  private onScanLifecycle: {
    onStart?: () => void | Promise<void>
    onEnd?: () => void | Promise<void>
  } = {}

  constructor(
    db: Database.Database,
    artworkCacheDir: string,
    createWorker: LibraryScanWorkerFactory = (fileName, options) => new Worker(fileName, options),
    getAllWindows: () => BrowserWindow[] = () => BrowserWindow.getAllWindows(),
  ) {
    this.db = db
    this.libraryRootRepository = new LibraryRootRepository(db)
    this.scanJobRepository = new ScanJobRepository(db)
    this.scanFailureRepository = new ScanFailureRepository(db)
    this.trackRepository = new TrackRepository(db)
    this.artworkCacheDir = artworkCacheDir
    this.createWorker = createWorker
    this.sendToRenderer = createRendererEventSender(getAllWindows)
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

  /** True while a scan worker (or a scan in preparation) is running. */
  isScanActive(): boolean {
    return this.activeWorker !== null || this.activeJobId !== null
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

  startScan(rootId: number): Promise<{ jobId: number }> {
    if (this.stopping) return Promise.reject(new Error('Library scan service is shutting down'))
    const request = this.startScanInternal(rootId)
    this.pendingStarts.add(request)
    void request.then(
      () => this.pendingStarts.delete(request),
      () => this.pendingStarts.delete(request),
    )
    return request
  }

  async shutdown(): Promise<void> {
    this.stopping = true
    await Promise.allSettled([...this.pendingStarts])
    if (this.activeJobId !== null) await this.cancelScan(this.activeJobId)
  }

  private async startScanInternal(rootId: number): Promise<{ jobId: number }> {
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
    this.pendingNewTracks.clear()
    this.scanHadFailures = false
    this.activeJobId = job.jobId

    try {
      await this.onScanLifecycle.onStart?.()
      if (this.stopping) throw new Error('Library scan interrupted by application shutdown')
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
    try {
      await worker.terminate()
    } catch (error) {
      this.activeWorker = worker
      this.activeJobId = jobId
      throw error
    }
    this.scanJobRepository.finish(jobId, 'canceled')
    this.pendingNewTracks.clear()
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
    const worker = this.createWorker(workerPath, {
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
        this.pendingNewTracks.clear()
        this.activeJobId = null
        void endLifecycle()
      }
    }

    const settleFailed = (reason: string, error?: unknown): void => {
      if (terminalSettled || this.activeWorker !== worker) {
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
      if (progress.failedFiles > 0) this.scanHadFailures = true
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
      // New paths wait until the complete inventory can distinguish moves from copies.
      const knownPaths = this.trackRepository.getExistingFilePaths(
        message.payload.map((track) => track.filePath),
      )
      const knownTracks: ScannedTrack[] = []
      for (const track of message.payload) {
        if (knownPaths.has(track.filePath)) knownTracks.push(track)
        else this.pendingNewTracks.set(track.filePath, track)
      }
      this.trackRepository.upsertMany(knownTracks)
      return
    }

    if (message.type === 'albumArtwork') {
      this.trackRepository.patchAlbumArtwork(message.payload)
      return
    }

    if (message.type === 'trackLyrics') {
      this.trackRepository.patchLyrics(message.payload)
      const filePaths = message.payload.map((patch) => patch.filePath)
      this.publishChanged(
        'metadata-refresh',
        this.trackRepository.getTrackIdsByFilePaths(filePaths),
        filePaths,
      )
      return
    }

    if (message.type === 'failure') {
      this.scanHadFailures = true
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

        const candidates = this.trackRepository
          .getMissingCandidates()
          .filter(
            (candidate) =>
              isUnderDirectory(candidate.filePath, root.path) &&
              !message.payload.unreadableDirectoryPaths.some((directory) =>
                isUnderDirectory(candidate.filePath, directory),
              ),
          )
        const imported = this.upsertOrRelocateTracks(
          [...this.pendingNewTracks.values()],
          candidates,
        )

        const removedIds =
          !this.scanHadFailures &&
          status.failedFiles === 0 &&
          message.payload.unreadableDirectoryPaths.length === 0
            ? new MissingTrackCleanupRepository(this.db).removeConfirmedMissing(root.path)
            : []

        if (!this.scanJobRepository.finish(workerJobId, 'completed')) {
          throw new Error(`Scan job was no longer active while completing: ${workerJobId}`)
        }

        const relocated = new Set(imported.relocatedIds)
        return {
          status,
          restoredIds,
          missingIds: [
            ...new Set([...missingIds.filter((id) => !relocated.has(id)), ...removedIds]),
          ],
          imported,
        }
      })()

      if (!result) {
        return
      }

      this.publishImportedTracks(result.imported)

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

  private upsertOrRelocateTracks(
    tracks: ScannedTrack[],
    candidates: ReturnType<TrackRepository['getMissingCandidates']>,
  ): ImportedTracks {
    const newTracks: ScannedTrack[] = []
    const relocatedIds: number[] = []
    const relocatedPaths: string[] = []
    const matches = findUniqueRelocations(candidates, tracks)
    for (const track of tracks) {
      try {
        const match = matches.get(track.filePath)

        if (match) {
          const relocated = this.trackRepository.relocateTrack(match.trackId, track, match.filePath)

          if (relocated) {
            relocatedIds.push(match.trackId)
            relocatedPaths.push(track.filePath)
          } else {
            // Path occupied or constraint race — fall back to path upsert.
            newTracks.push(track)
          }
        } else {
          newTracks.push(track)
        }
      } catch (error) {
        this.scanHadFailures = true
        logger.warn(
          { error, filePath: track.filePath },
          'Failed to relocate/upsert scanned track; trying upsert fallback',
        )
        newTracks.push(track)
      }
    }
    let addedPaths: string[] = []
    if (newTracks.length > 0) {
      const newTrackPaths = newTracks.map((track) => track.filePath)
      const existingPaths = this.trackRepository.getExistingFilePaths(newTrackPaths)
      addedPaths = newTrackPaths.filter((filePath) => !existingPaths.has(filePath))

      try {
        this.trackRepository.upsertMany(newTracks)
      } catch (error) {
        // One bad row must not drop the whole batch — retry per track.
        this.scanHadFailures = true
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

      const committedPaths = this.trackRepository.getExistingFilePaths(addedPaths)
      addedPaths = addedPaths.filter((path) => committedPaths.has(path))
    }
    return { addedPaths, relocatedIds, relocatedPaths }
  }

  private publishImportedTracks(result: ImportedTracks): void {
    if (result.addedPaths.length > 0) {
      this.publishChanged(
        'track-added',
        this.trackRepository.getTrackIdsByFilePaths(result.addedPaths),
        result.addedPaths,
      )
    }
    if (result.relocatedIds.length > 0) {
      this.publishChanged('track-relocated', result.relocatedIds, result.relocatedPaths)
    }
  }

  private publishProgress(progress: LibraryScanProgress): void {
    this.sendToRenderer(ipcChannels.library.scanProgress, progress)
  }

  private publishChanged(
    reason:
      | 'track-added'
      | 'track-missing'
      | 'track-restored'
      | 'track-relocated'
      | 'metadata-refresh',
    trackIds: number[],
    filePaths: string[] = [],
  ): void {
    this.sendToRenderer(ipcChannels.library.changed, { reason, trackIds, filePaths })
  }
}
