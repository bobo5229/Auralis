import { win32 } from 'node:path'
import type Database from 'better-sqlite3'
import type { LibraryScanProgress, LibraryScanStatus } from '@shared/types/libraryScan'
import type { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import type { ScanJobRepository } from '@main/repositories/scanJobRepository'
import type { TrackRepository } from '@main/repositories/trackRepository'
import { ScanFailureRepository } from '@main/repositories/scanFailureRepository'
import { MissingTrackCleanupRepository } from '@main/repositories/missingTrackCleanupRepository'
import { ScanStagingRepository } from '@main/repositories/scanStagingRepository'
import type { LibraryScanEvents } from './libraryScanEvents'
import type {
  LibraryScanWorkerMessage,
  ScannedTrackFile,
  ScanFileSnapshot,
} from './libraryScanTypes'
import { importScannedTracks, type ImportedTracks } from './libraryScanTrackImport'
import { isCurrentScanSnapshot } from './libraryScanSnapshot'
import type { ScanSettlementEvent, ScanSettlementSnapshot } from './libraryScanSettlementTypes'

interface CompletedScan {
  status: LibraryScanStatus
  restoredIds: number[]
  missingIds: number[]
  imported: ImportedTracks
}

function isUnderDirectory(filePath: string, directory: string): boolean {
  const relative = win32.relative(directory, filePath)
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith('..\\') && !win32.isAbsolute(relative))
  )
}

export class LibraryScanPersistence {
  private readonly staging: ScanStagingRepository
  private readonly rejectedScanFiles = new Set<string>()
  private scanHadFailures = false
  phase: 'reading' | 'settling' = 'reading'
  private readonly scanFailureRepository: ScanFailureRepository

  constructor(
    private readonly db: Database.Database,
    private readonly libraryRootRepository: LibraryRootRepository,
    private readonly scanJobRepository: ScanJobRepository,
    private readonly trackRepository: TrackRepository,
    private readonly events: LibraryScanEvents,
    private readonly settlement?: {
      checkCanceled(): void
      beforeCommit(events: ScanSettlementEvent[]): void
    },
  ) {
    this.scanFailureRepository = new ScanFailureRepository(db)
    this.staging = new ScanStagingRepository(db)
  }

  begin(): void {
    this.clearPendingTracks()
    this.scanHadFailures = false
    this.phase = 'reading'
  }

  exportSettlement(): ScanSettlementSnapshot {
    return { hadFailures: this.scanHadFailures }
  }

  restoreSettlement(snapshot: ScanSettlementSnapshot): void {
    this.begin()
    this.scanHadFailures = snapshot.hadFailures
  }

  clearPendingTracks(): void {
    this.rejectedScanFiles.clear()
  }

  fail(jobId: number, reason: string, defaultFailedFiles = 0): void {
    this.scanJobRepository.fail(jobId, reason)
    const status = this.scanJobRepository.getById(jobId)
    this.publishProgress({
      jobId,
      status: 'failed',
      totalFiles: status?.totalFiles ?? 0,
      scannedFiles: status?.scannedFiles ?? 0,
      failedFiles: status?.failedFiles ?? defaultFailedFiles,
      currentFile: null,
      message: reason,
    })
  }

  handleMessage(message: LibraryScanWorkerMessage, workerJobId: number): void {
    if (message.type === 'inventory') {
      this.staging.stageInventory(
        workerJobId,
        message.payload.foundFilePaths,
        message.payload.unreadableDirectoryPaths,
      )
      return
    }
    if (message.type === 'progress') {
      this.phase = message.payload.phase ?? 'reading'
      const progress = {
        ...message.payload,
        failedFiles: message.payload.failedFiles + this.rejectedScanFiles.size,
      }
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
      const knownTracks: ScannedTrackFile[] = []
      const newTracks: ScannedTrackFile[] = []
      for (const track of message.payload) {
        if (knownPaths.has(track.filePath)) knownTracks.push(track)
        else newTracks.push(track)
      }
      this.staging.stageTracks(workerJobId, newTracks)
      const currentTracks = this.acceptCurrentSnapshots(knownTracks, workerJobId, true)
      this.trackRepository.upsertMany(currentTracks)
      if (currentTracks.length > 0) {
        const filePaths = currentTracks.map((track) => track.filePath)
        this.publishChanged(
          'metadata-refresh',
          this.trackRepository.getTrackIdsByFilePaths(filePaths),
          filePaths,
        )
      }
      return
    }

    if (message.type === 'trackTags') {
      const patches = this.acceptCurrentSnapshots(message.payload, workerJobId, false)
      this.trackRepository.patchTrackTags(patches)
      if (patches.length > 0) {
        const filePaths = patches.map((patch) => patch.filePath)
        this.publishChanged(
          'metadata-refresh',
          this.trackRepository.getTrackIdsByFilePaths(filePaths),
          filePaths,
        )
      }
      return
    }

    if (message.type === 'albumArtwork') {
      const patches = message.payload.filter(
        (patch) =>
          !patch.filePath ||
          (patch.fileFingerprint &&
            this.acceptCurrentSnapshots(
              [{ ...patch, filePath: patch.filePath, fileFingerprint: patch.fileFingerprint }],
              workerJobId,
              false,
            ).length > 0),
      )
      this.trackRepository.patchAlbumArtwork(patches)
      const paths = patches.flatMap((patch) => (patch.filePath ? [patch.filePath] : []))
      if (paths.length)
        this.publishChanged(
          'metadata-refresh',
          this.trackRepository.getTrackIdsByFilePaths(paths),
          paths,
        )
      return
    }

    if (message.type === 'trackLyrics') {
      const patches = this.acceptCurrentSnapshots(message.payload, workerJobId, true)
      if (patches.length === 0) return
      this.trackRepository.patchLyrics(patches)
      const filePaths = patches.map((patch) => patch.filePath)
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
      this.fail(workerJobId, message.payload.reason, 1)
      return
    }

    if (message.type === 'complete') {
      this.staging.stageInventory(
        workerJobId,
        message.payload.foundFilePaths,
        message.payload.unreadableDirectoryPaths,
      )
      const result = this.db.transaction(() => {
        this.settlement?.checkCanceled()
        const status = this.scanJobRepository.getById(workerJobId)

        if (!status || status.status !== 'scanning') {
          return null
        }

        const root = this.libraryRootRepository.getById(status.rootId)
        if (!root) {
          throw new Error(`Library root not found while completing scan: ${status.rootId}`)
        }

        this.libraryRootRepository.markScanned(status.rootId)
        const unreadable = this.staging.unreadableDirectories(workerJobId)
        const { restoredIds, missingIds } = this.trackRepository.settleScanAvailability(
          root.path,
          workerJobId,
          unreadable,
        )
        this.settlement?.checkCanceled()

        const candidates = this.trackRepository
          .getMissingCandidates()
          .filter(
            (candidate) =>
              isUnderDirectory(candidate.filePath, root.path) &&
              !unreadable.some((directory) => isUnderDirectory(candidate.filePath, directory)),
          )
        const imported = importScannedTracks(
          () => this.staging.tracks<ScannedTrackFile>(workerJobId),
          candidates,
          this.trackRepository,
          () => {
            this.scanHadFailures = true
          },
          () => this.settlement?.checkCanceled(),
        )
        const allRestoredIds = restoredIds.concat(
          this.trackRepository.markAvailableByFilePaths(imported.restoredPaths),
        )

        // Worker counters cover reads; final per-track persistence failures must
        // also reach the stored job and its terminal progress event.
        const failedFiles = status.failedFiles + imported.failures.length
        if (imported.failures.length > 0) {
          this.scanFailureRepository.insertMany(
            imported.failures.map((failure) => ({ ...failure, jobId: workerJobId })),
          )
          this.scanJobRepository.updateProgress(
            workerJobId,
            status.totalFiles,
            status.scannedFiles,
            failedFiles,
          )
        }

        const removedIds =
          !this.scanHadFailures &&
          status.failedFiles === 0 &&
          !this.db.prepare('SELECT 1 FROM scan_failures WHERE job_id=? LIMIT 1').get(workerJobId) &&
          unreadable.length === 0
            ? new MissingTrackCleanupRepository(this.db).removeConfirmedMissing(root.path, () =>
                this.settlement?.checkCanceled(),
              )
            : []

        this.staging.complete(workerJobId, root.id)
        if (!this.scanJobRepository.finish(workerJobId, 'completed')) {
          throw new Error(`Scan job was no longer active while completing: ${workerJobId}`)
        }

        const relocated = new Set(imported.relocatedIds)
        const restored = new Set(allRestoredIds)
        const completed: CompletedScan = {
          status: { ...status, failedFiles },
          restoredIds: allRestoredIds,
          missingIds: [
            ...new Set([
              ...missingIds.filter((id) => !relocated.has(id) && !restored.has(id)),
              ...removedIds,
            ]),
          ],
          imported,
        }
        const events = this.settlementEvents(completed)
        this.settlement?.beforeCommit(events)
        return events
      })()

      if (!result) {
        return
      }

      for (const event of result) {
        if (event.type === 'changed') this.events.changed(event.payload)
        else this.events.progress(event.payload)
      }
    }
  }

  private settlementEvents(result: CompletedScan): ScanSettlementEvent[] {
    const events: ScanSettlementEvent[] = []
    const changed = (
      reason: Extract<ScanSettlementEvent, { type: 'changed' }>['payload']['reason'],
      trackIds: number[],
      filePaths: string[] = [],
    ) => {
      events.push({ type: 'changed', payload: { reason, trackIds, filePaths } })
    }
    if (result.imported.addedPaths.length)
      changed(
        'track-added',
        this.trackRepository.getTrackIdsByFilePaths(result.imported.addedPaths),
        result.imported.addedPaths,
      )
    if (result.imported.relocatedIds.length)
      changed('track-relocated', result.imported.relocatedIds, result.imported.relocatedPaths)
    if (result.restoredIds.length)
      changed('track-restored', result.restoredIds, [
        ...this.trackRepository.getFilePathsByIds(result.restoredIds),
        ...result.imported.restoredPaths,
      ])
    if (result.missingIds.length) changed('track-missing', result.missingIds)
    events.push({
      type: 'progress',
      payload: {
        jobId: result.status.jobId,
        status: 'completed',
        totalFiles: result.status.totalFiles,
        scannedFiles: result.status.scannedFiles,
        failedFiles: result.status.failedFiles,
        currentFile: null,
        message: 'Scan completed',
      },
    })
    return events
  }

  private acceptCurrentSnapshots<T extends ScanFileSnapshot>(
    items: T[],
    jobId: number,
    verifyLyrics: boolean,
  ): T[] {
    const accepted: T[] = []
    const failures: { jobId: number; filePath: string; reason: string }[] = []
    for (const item of items) {
      if (isCurrentScanSnapshot(item, verifyLyrics)) {
        accepted.push(item)
      } else if (!this.rejectedScanFiles.has(item.filePath)) {
        this.rejectedScanFiles.add(item.filePath)
        this.scanHadFailures = true
        failures.push({
          jobId,
          filePath: item.filePath,
          reason: 'Audio file or lyric sidecar changed or became unavailable before scan update',
        })
      }
    }
    if (failures.length > 0) {
      this.scanFailureRepository.insertMany(failures)
      const status = this.scanJobRepository.getById(jobId)
      if (status) {
        this.scanJobRepository.updateProgress(
          jobId,
          status.totalFiles,
          status.scannedFiles,
          status.failedFiles + failures.length,
        )
      }
    }
    return accepted
  }

  publishMissingTracks(trackIds: number[]): void {
    this.publishChanged('track-missing', trackIds)
  }

  publishProgress(progress: LibraryScanProgress): void {
    this.events.progress(progress)
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
    this.events.changed({ reason, trackIds, filePaths })
  }
}
