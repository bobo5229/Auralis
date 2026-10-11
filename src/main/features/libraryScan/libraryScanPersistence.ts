import { win32 } from 'node:path'
import type Database from 'better-sqlite3'
import { ipcChannels } from '@shared/ipc/channels'
import type { LibraryScanProgress, ScannedTrack } from '@shared/types/libraryScan'
import type { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import type { ScanJobRepository } from '@main/repositories/scanJobRepository'
import type { TrackRepository } from '@main/repositories/trackRepository'
import { ScanFailureRepository } from '@main/repositories/scanFailureRepository'
import { MissingTrackCleanupRepository } from '@main/repositories/missingTrackCleanupRepository'
import type { RendererEventSender } from '@main/ipc/rendererEvents'
import type { LibraryScanWorkerMessage } from './libraryScanTypes'
import { importScannedTracks, type ImportedTracks } from './libraryScanTrackImport'

function isUnderDirectory(filePath: string, directory: string): boolean {
  const relative = win32.relative(directory, filePath)
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith('..\\') && !win32.isAbsolute(relative))
  )
}

export class LibraryScanPersistence {
  private readonly pendingNewTracks = new Map<string, ScannedTrack>()
  private scanHadFailures = false
  private readonly scanFailureRepository: ScanFailureRepository

  constructor(
    private readonly db: Database.Database,
    private readonly libraryRootRepository: LibraryRootRepository,
    private readonly scanJobRepository: ScanJobRepository,
    private readonly trackRepository: TrackRepository,
    private readonly sendToRenderer: RendererEventSender,
  ) {
    this.scanFailureRepository = new ScanFailureRepository(db)
  }

  begin(): void {
    this.clearPendingTracks()
    this.scanHadFailures = false
  }

  clearPendingTracks(): void {
    this.pendingNewTracks.clear()
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
      if (knownTracks.length > 0) {
        const filePaths = knownTracks.map((track) => track.filePath)
        this.publishChanged(
          'metadata-refresh',
          this.trackRepository.getTrackIdsByFilePaths(filePaths),
          filePaths,
        )
      }
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

  publishMissingTracks(trackIds: number[]): void {
    this.publishChanged('track-missing', trackIds)
  }

  publishProgress(progress: LibraryScanProgress): void {
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
