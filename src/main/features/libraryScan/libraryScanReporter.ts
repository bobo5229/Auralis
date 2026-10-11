import type { LibraryScanWorkerMessage } from './libraryScanTypes'
import type { ReadTrackResult } from './libraryScanTrackReader'
import type { AlbumArtworkPatch, ScannedTrack, TrackLyricsPatch } from '@shared/types/libraryScan'

/** Owns outgoing batches, counters and the complete inventory for one scan. */
export class LibraryScanReporter {
  private readonly trackBatch: ScannedTrack[] = []
  private readonly artworkBatch: AlbumArtworkPatch[] = []
  private readonly lyricsBatch: TrackLyricsPatch[] = []
  private readonly foundFilePaths: string[] = []
  private readonly unreadableDirectoryPaths: string[] = []
  private totalFiles = 0
  private scannedFiles = 0
  private failedFiles = 0
  private lastProgressAt = 0

  constructor(
    private readonly jobId: number,
    private readonly postMessage: (message: LibraryScanWorkerMessage) => void,
  ) {}

  beginCollection(): void {
    this.postProgress(null, 'Collecting audio files', true)
  }

  beginScanning(totalFiles: number): void {
    this.totalFiles = totalFiles
    this.postProgress(null, 'Scanning audio files', true)
  }

  reportUnreadableDirectory(directoryPath: string): void {
    this.unreadableDirectoryPaths.push(directoryPath)
    this.postMessage({
      type: 'failure',
      payload: { jobId: this.jobId, filePath: directoryPath, reason: 'Unable to read directory' },
    })
    this.failedFiles += 1
  }

  reportFileFailure(filePath: string, reason: string): void {
    this.failedFiles += 1
    this.postMessage({ type: 'failure', payload: { jobId: this.jobId, filePath, reason } })
  }

  complete(): void {
    this.flushTrackBatch()
    this.flushArtworkBatch()
    this.flushLyricsBatch()
    this.postProgress(null, 'Scan complete', true)
    this.postMessage({
      type: 'complete',
      payload: {
        foundFilePaths: this.foundFilePaths,
        unreadableDirectoryPaths: this.unreadableDirectoryPaths,
      },
    })
  }

  private postProgress(currentFile: string | null, message: string | null, force = false): void {
    const now = Date.now()
    if (!force && this.scannedFiles % 100 !== 0 && now - this.lastProgressAt < 200) return
    this.lastProgressAt = now
    this.postMessage({
      type: 'progress',
      payload: {
        jobId: this.jobId,
        status: 'scanning',
        totalFiles: this.totalFiles,
        scannedFiles: this.scannedFiles,
        failedFiles: this.failedFiles,
        currentFile,
        message,
      },
    })
  }

  handleReadResult(result: ReadTrackResult, filePath: string): void {
    this.scannedFiles += 1
    this.foundFilePaths.push(filePath)

    if (result.kind === 'track') {
      this.trackBatch.push(result.track)

      if (this.trackBatch.length >= 300) {
        this.flushTrackBatch()
      }
    } else if (result.kind === 'artwork') {
      this.artworkBatch.push(result.patch)

      if (this.artworkBatch.length >= 300) {
        this.flushArtworkBatch()
      }
    } else if (result.kind === 'patches') {
      if (result.artworkPatch) {
        this.artworkBatch.push(result.artworkPatch)
      }

      if (result.lyricsPatch) {
        this.lyricsBatch.push(result.lyricsPatch)
      }

      if (this.artworkBatch.length >= 300) {
        this.flushArtworkBatch()
      }

      if (this.lyricsBatch.length >= 300) {
        this.flushLyricsBatch()
      }
    }

    this.postProgress(filePath, null)
  }

  private flushTrackBatch(): void {
    if (this.trackBatch.length === 0) {
      return
    }

    this.postMessage({ type: 'tracks', payload: this.trackBatch.splice(0, this.trackBatch.length) })
  }

  private flushArtworkBatch(): void {
    if (this.artworkBatch.length === 0) {
      return
    }

    this.postMessage({
      type: 'albumArtwork',
      payload: this.artworkBatch.splice(0, this.artworkBatch.length),
    })
  }

  private flushLyricsBatch(): void {
    if (this.lyricsBatch.length === 0) {
      return
    }

    this.postMessage({
      type: 'trackLyrics',
      payload: this.lyricsBatch.splice(0, this.lyricsBatch.length),
    })
  }
}
