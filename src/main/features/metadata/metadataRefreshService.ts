import type { MetadataRefreshRepository } from '@main/repositories/metadataRefreshRepository'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import type { UpdateTrackMetadataResult } from '@shared/ipc/contracts'
import type { MetadataRefreshWorkerInput } from './metadataRefreshTypes'
import type { MetadataRefreshEvents } from './metadataRefreshEvents'
import { MetadataRefreshWorkerHost } from './metadataRefreshWorkerHost'
import { logger } from '@main/logging/logger'
import {
  MetadataTagWriteCoordinator,
  type MetadataWriteCoordinator,
  type PlaybackMetadataTagWrite,
} from './metadataTagWriteCoordinator'

export type { MetadataWriteCoordinator } from './metadataTagWriteCoordinator'
export type { MetadataRefreshProgress } from './metadataRefreshWorkerHost'

export class MetadataRefreshService {
  private readonly workerHost: MetadataRefreshWorkerHost
  private readonly tagWrites: MetadataTagWriteCoordinator
  private stopping = false
  private legacyRecoveryEnabled = false
  private legacyRecoveryPaused = false
  private legacyRecoveryJob: number | null = null
  private legacyRecoveryCursor = 0
  private legacyRecoveryAttempt = 0
  private legacyRecoveryTimer: ReturnType<typeof setTimeout> | null = null
  private legacyRecoveryWaiters: Array<() => void> = []

  constructor(
    private readonly repository: MetadataRefreshRepository,
    private readonly artworkCacheDir: string,
    events: MetadataRefreshEvents,
    ffmpegPath: string,
    coordinator?: MetadataWriteCoordinator,
    readLibraryRevision?: () => string,
  ) {
    this.tagWrites = new MetadataTagWriteCoordinator(
      repository,
      artworkCacheDir,
      ffmpegPath,
      {
        isStopping: () => this.stopping,
        hasActiveJob: () => this.hasActiveJob(),
        refreshTracksFromFileChanges: (ids) => this.refreshTracksFromFileChanges(ids),
        onUserEditCommitted: (trackId, filePath) => {
          const libraryRevision = readLibraryRevision?.()
          events.libraryChanged({
            reason: 'metadata-refresh',
            trackIds: [trackId],
            filePaths: [filePath],
            ...(libraryRevision ? { libraryRevision } : {}),
          })
          return libraryRevision
        },
      },
      coordinator,
    )
    this.workerHost = new MetadataRefreshWorkerHost(repository, events, this.tagWrites, () => {
      this.tagWrites.flushReconciliation()
      if (this.legacyRecoveryJob !== null) {
        this.legacyRecoveryJob = null
        for (const resolve of this.legacyRecoveryWaiters.splice(0)) resolve()
      }
      this.scheduleLegacyRecovery(0)
    })
    this.repository.markInterruptedJobs()
  }

  startLegacyLyricsRecovery(): void {
    this.legacyRecoveryEnabled = true
    this.scheduleLegacyRecovery(0)
  }

  async pauseLegacyLyricsRecovery(): Promise<void> {
    this.legacyRecoveryPaused = true
    if (this.legacyRecoveryTimer) clearTimeout(this.legacyRecoveryTimer)
    this.legacyRecoveryTimer = null
    if (this.legacyRecoveryJob !== null)
      await new Promise<void>((resolve) => this.legacyRecoveryWaiters.push(resolve))
  }

  resumeLegacyLyricsRecovery(): void {
    this.legacyRecoveryPaused = false
    this.scheduleLegacyRecovery(0)
  }

  private scheduleLegacyRecovery(delay: number): void {
    if (
      !this.legacyRecoveryEnabled ||
      this.legacyRecoveryPaused ||
      this.stopping ||
      this.legacyRecoveryTimer
    )
      return
    this.legacyRecoveryTimer = setTimeout(() => {
      this.legacyRecoveryTimer = null
      this.runLegacyRecovery()
    }, delay)
    this.legacyRecoveryTimer.unref()
  }

  private runLegacyRecovery(): void {
    if (this.stopping || this.legacyRecoveryPaused) return
    if (this.hasActiveJob()) {
      this.scheduleLegacyRecovery(1000)
      return
    }
    let jobId: number | undefined
    try {
      const tracks = this.repository.getLegacyTtmlTracks(this.legacyRecoveryCursor, 128)
      if (!tracks.length) {
        this.legacyRecoveryCursor = 0
        const delay = Math.min(60000 * 2 ** Math.min(this.legacyRecoveryAttempt, 4), 900000)
        this.legacyRecoveryAttempt += 1
        this.scheduleLegacyRecovery(delay)
        return
      }
      this.repository.pruneLegacyLyricsJobs()
      jobId = this.repository.createJob('legacy-lyrics', tracks.length)
      this.workerHost.start({
        jobId,
        tracks,
        artworkCacheDir: this.artworkCacheDir,
        writeMode: 'legacy-ttml',
      })
      this.legacyRecoveryCursor = tracks[tracks.length - 1].trackId
      this.legacyRecoveryJob = jobId
    } catch (error) {
      if (jobId !== undefined)
        this.repository.completeJob(jobId, 'Legacy lyric recovery failed to start')
      logger.warn({ error }, 'Unable to start legacy lyric recovery')
      this.scheduleLegacyRecovery(60000)
    }
  }

  setTagWriteSuccessHandler(handler: (filePath: string) => void): void {
    this.tagWrites.setTagWriteSuccessHandler(handler)
  }

  setPlaybackTagWriteHandler(handler: PlaybackMetadataTagWrite): void {
    this.tagWrites.setPlaybackTagWriteHandler(handler)
  }

  hasActiveArtworkWrites(): boolean {
    return this.hasActiveJob() || this.tagWrites.hasActiveWrites()
  }

  isWritingFile(filePath: string): boolean {
    return this.tagWrites.isWritingFile(filePath)
  }

  hasActiveJob(): boolean {
    return this.workerHost.jobId !== null
  }

  async shutdown(): Promise<void> {
    this.stopping = true
    if (this.legacyRecoveryTimer) clearTimeout(this.legacyRecoveryTimer)
    this.legacyRecoveryTimer = null
    try {
      await this.tagWrites.drain()
      await this.workerHost.shutdown()
      await this.tagWrites.awaitReconciliation()
    } finally {
      this.legacyRecoveryJob = null
      for (const resolve of this.legacyRecoveryWaiters.splice(0)) resolve()
    }
  }

  private assertRunning(): void {
    if (this.stopping) throw new Error('Metadata refresh service is shutting down')
  }

  refreshTrack(trackId: number): { jobId: number } {
    return this.refreshTracks([trackId])
  }

  refreshTracks(trackIds: number[]): { jobId: number } {
    return this.refreshTracksForScope(trackIds, 'tracks')
  }

  refreshTracksFromFileChanges(trackIds: number[]): { jobId: number } {
    return this.refreshTracksForScope(trackIds, 'file-change')
  }

  private refreshTracksForScope(trackIds: number[], scope: string): { jobId: number } {
    this.assertRunning()
    if (this.workerHost.jobId !== null && this.repository.getActiveJob()) {
      throw new Error(`A refresh job is already running (job ${this.workerHost.jobId})`)
    }

    const tracks = this.repository.getTracksByIds(trackIds)

    if (tracks.length === 0) {
      throw new Error('No matching tracks found')
    }

    const jobId = this.repository.createJob(scope, tracks.length)
    const workerInput: MetadataRefreshWorkerInput = {
      jobId,
      tracks,
      artworkCacheDir: this.artworkCacheDir,
      writeMode: 'metadata',
    }

    this.workerHost.start(workerInput)

    return { jobId }
  }

  refreshLyricsForMissing(limit = 5000): { jobId: number } {
    this.assertRunning()
    if (this.workerHost.jobId !== null && this.repository.getActiveJob()) {
      throw new Error(`A refresh job is already running (job ${this.workerHost.jobId})`)
    }

    const tracks = this.repository.getTracksWithMissingLyrics(limit)

    if (tracks.length === 0) {
      throw new Error('No tracks with missing lyrics found')
    }

    const jobId = this.repository.createJob('missing-lyrics', tracks.length)
    this.workerHost.start({
      jobId,
      tracks,
      artworkCacheDir: this.artworkCacheDir,
      writeMode: 'lyrics',
    })

    return { jobId }
  }

  getJobStatus(jobId: number) {
    return this.repository.getJobById(jobId)
  }

  listFailures(limit?: number) {
    return this.repository.listFailures(limit)
  }

  clearFailures(): { deletedCount: number } {
    return { deletedCount: this.repository.clearFailures() }
  }

  getTrackMetadata(trackId: number) {
    return this.repository.getEditableTrackMetadata(trackId)
  }

  updateTrackMetadata(metadata: EditableTrackMetadata): Promise<UpdateTrackMetadataResult> {
    return this.tagWrites.updateTrackMetadata(metadata)
  }

  updateTrackLyrics(
    trackId: number,
    lyricsText: string,
    beforeCommit: () => Promise<void>,
    onDiskCommit: () => void,
  ): Promise<UpdateTrackMetadataResult> {
    const metadata = this.repository.getEditableTrackMetadata(trackId)
    if (!metadata) return Promise.resolve({ ok: false, reason: 'file-not-found' })
    return this.tagWrites.updateTrackMetadata(
      { ...metadata, lyricsText },
      beforeCommit,
      onDiskCommit,
    )
  }
}
