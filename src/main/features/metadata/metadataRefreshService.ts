import type { MetadataRefreshRepository } from '@main/repositories/metadataRefreshRepository'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import type { UpdateTrackMetadataResult } from '@shared/ipc/contracts'
import type { MetadataRefreshWorkerInput } from './metadataRefreshTypes'
import type { RendererEventSender } from '@main/ipc/rendererEvents'
import { MetadataRefreshWorkerHost } from './metadataRefreshWorkerHost'
import {
  MetadataTagWriteCoordinator,
  type MetadataWriteCoordinator,
  type BufferedMetadataTagWrite,
} from './metadataTagWriteCoordinator'

export type { MetadataWriteCoordinator } from './metadataTagWriteCoordinator'
export type { MetadataRefreshProgress } from './metadataRefreshWorkerHost'

export class MetadataRefreshService {
  private readonly workerHost: MetadataRefreshWorkerHost
  private readonly tagWrites: MetadataTagWriteCoordinator
  private stopping = false

  constructor(
    private readonly repository: MetadataRefreshRepository,
    private readonly artworkCacheDir: string,
    sendToRenderer: RendererEventSender,
    ffmpegPath: string,
    coordinator?: MetadataWriteCoordinator,
  ) {
    this.tagWrites = new MetadataTagWriteCoordinator(
      repository,
      artworkCacheDir,
      ffmpegPath,
      {
        isStopping: () => this.stopping,
        hasActiveJob: () => this.hasActiveJob(),
        refreshTracksFromFileChanges: (ids) => this.refreshTracksFromFileChanges(ids),
      },
      coordinator,
    )
    this.workerHost = new MetadataRefreshWorkerHost(
      repository,
      sendToRenderer,
      this.tagWrites,
      () => this.tagWrites.flushReconciliation(),
    )
    this.repository.markInterruptedJobs()
  }

  setTagWriteSuccessHandler(handler: (filePath: string) => void): void {
    this.tagWrites.setTagWriteSuccessHandler(handler)
  }

  setBufferedTagWriteHandler(handler: BufferedMetadataTagWrite): void {
    this.tagWrites.setBufferedTagWriteHandler(handler)
  }

  hasActiveArtworkWrites(): boolean {
    return this.hasActiveJob() || this.tagWrites.hasActiveWrites()
  }

  hasActiveJob(): boolean {
    return this.workerHost.jobId !== null
  }

  async shutdown(): Promise<void> {
    this.stopping = true
    await this.tagWrites.drain()
    await this.workerHost.shutdown()
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
}
