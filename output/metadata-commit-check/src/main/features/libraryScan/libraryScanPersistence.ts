import { win32 } from 'node:path'
import type Database from 'better-sqlite3'
import type { LibraryScanProgress } from '@shared/types/libraryScan'
import type { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import type { ScanJobRepository } from '@main/repositories/scanJobRepository'
import type { TrackRepository } from '@main/repositories/trackRepository'
import { ScanFailureRepository } from '@main/repositories/scanFailureRepository'
import { MissingTrackCleanupRepository } from '@main/repositories/missingTrackCleanupRepository'
import type { LibraryScanEvents } from './libraryScanEvents'
import type {
  LibraryScanWorkerMessage,
  ScannedTrackFile,
  ScanFileSnapshot,
} from './libraryScanTypes'
import { importScannedTracks, type ImportedTracks } from './libraryScanTrackImport'
import { isCurrentScanSnapshot } from './libraryScanSnapshot'

function isUnderDirectory(filePath: string, directory: string): boolean {
  const relative = win32.relative(directory, filePath)
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith('..\\') && !win32.isAbsolute(relative))
  )
}

export class LibraryScanPersistence {
  private readonly pendingNewTracks = new Map<string, ScannedTrackFile>()
  private readonly rejectedScanFiles = new Set<string>()
  private scanHadFailures = false
  private readonly scanFailureRepository: ScanFailureRepository

  constructor(
    private readonly db: Database.Database,
    private readonly libraryRootRepository: LibraryRootRepository,
    private readonly scanJobRepository: ScanJobRepository,
    private readonly trackRepository: TrackRepository,
    private readonly events: LibraryScanEvents,
  ) {
    this.scanFailureRepository = new ScanFailureRepository(db)
  }

  begin(): void {
    this.clearPendingTracks()
    this.scanHadFailures = false
  }

  clearPendingTracks(): void {
    this.pendingNewTracks.clear()
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
    if (message.type === 'progress') {
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
      for (const track of message.payload) {
        if (knownPaths.has(track.filePath)) knownTracks.push(track)
        else this.pendingNewTracks.set(track.filePath, track)
      }
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
        const imported = importScannedTracks(
          [...this.pendingNewTracks.values()],
          candidates,
          this.trackRepository,
          () => {
            this.scanHadFailures = true
          },
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
          message.payload.unreadableDirectoryPaths.length === 0
            ? new MissingTrackCleanupRepository(this.db).removeConfirmedMissing(root.path)
            : []

        if (!this.scanJobRepository.finish(workerJobId, 'completed')) {
          throw new Error(`Scan job was no longer active while completing: ${workerJobId}`)
        }

        const relocated = new Set(imported.relocatedIds)
        const restored = new Set(allRestoredIds)
        return {
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
      })()

      if (!result) {
        return
      }

      this.publishImportedTracks(result.imported)

      if (result.restoredIds.length > 0) {
        this.publishChanged('track-restored', result.restoredIds, [
          ...message.payload.foundFilePaths,
          ...result.imported.restoredPaths,
        ])
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
