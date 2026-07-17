import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import { MetadataRefreshRepository } from '../../repositories/metadataRefreshRepository'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import type {
  MetadataRefreshWorkerInput,
  MetadataRefreshWorkerMessage,
} from './metadataRefreshTypes'
import { writeAudioTags } from './audioTagWriteService'

function getWorkerPath(): string {
  return join(__dirname, 'features/metadata/metadataRefreshWorker.js')
}

export interface MetadataRefreshProgress {
  jobId: number
  status: 'running' | 'completed' | 'failed'
  totalTracks: number
  processedTracks: number
  failedTracks: number
}

export class MetadataRefreshService {
  private activeWorker: Worker | null = null
  private activeJobId: number | null = null
  private onTagWriteSuccess: ((filePath: string) => void) | null = null

  constructor(
    private readonly repository: MetadataRefreshRepository,
    private readonly artworkCacheDir: string,
    private readonly sendToRenderer: (channel: string, data: unknown) => void,
  ) {
    this.repository.markInterruptedJobs()
  }

  /**
   * Wire a callback after successful audio tag writes (e.g. suppress watch refresh).
   */
  setTagWriteSuccessHandler(handler: (filePath: string) => void): void {
    this.onTagWriteSuccess = handler
  }

  refreshMissingMetadata(limit = 5000): { jobId: number } {
    if (this.activeJobId !== null && this.repository.getActiveJob()) {
      throw new Error(`A refresh job is already running (job ${this.activeJobId})`)
    }

    const tracks = this.repository.getTracksWithMissingMetadata(limit)

    if (tracks.length === 0) {
      throw new Error('No tracks with missing metadata found')
    }

    const jobId = this.repository.createJob('missing-metadata', tracks.length)
    const workerInput: MetadataRefreshWorkerInput = {
      jobId,
      tracks,
      artworkCacheDir: this.artworkCacheDir,
      writeMode: 'metadata',
    }

    this.startWorker(workerInput)

    return { jobId }
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
    if (this.activeJobId !== null && this.repository.getActiveJob()) {
      throw new Error(`A refresh job is already running (job ${this.activeJobId})`)
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

    this.startWorker(workerInput)

    return { jobId }
  }

  refreshLyricsForMissing(limit = 5000): { jobId: number } {
    if (this.activeJobId !== null && this.repository.getActiveJob()) {
      throw new Error(`A refresh job is already running (job ${this.activeJobId})`)
    }

    const tracks = this.repository.getTracksWithMissingLyrics(limit)

    if (tracks.length === 0) {
      throw new Error('No tracks with missing lyrics found')
    }

    const jobId = this.repository.createJob('missing-lyrics', tracks.length)
    this.startWorker({
      jobId,
      tracks,
      artworkCacheDir: this.artworkCacheDir,
      writeMode: 'lyrics',
    })

    return { jobId }
  }

  private startWorker(input: MetadataRefreshWorkerInput): void {
    const worker = new Worker(getWorkerPath(), {
      workerData: input,
    })

    this.activeWorker = worker
    this.activeJobId = input.jobId

    let failed = 0

    const cleanup = (): void => {
      if (this.activeWorker === worker) {
        this.activeWorker = null
        this.activeJobId = null
      }
    }

    worker.on('message', (message: MetadataRefreshWorkerMessage) => {
      switch (message.type) {
        case 'result': {
          const r = message.payload
          if (input.writeMode === 'lyrics') {
            this.repository.updateTrackLyrics(r.trackId, r.lyricsText, r.lyricsFormat)
          } else {
            this.repository.updateTrackMetadata(r)
          }
          break
        }

        case 'failure': {
          const f = message.payload

          if (f.trackId !== null && this.isMissingFileFailure(f.reason)) {
            this.repository.markTrackMissing(f.trackId)
          } else {
            this.repository.addFailure(f.jobId, f.trackId, f.filePath, f.reason)
          }

          failed += 1
          break
        }

        case 'progress': {
          const p = message.payload
          this.repository.updateJobProgress(p.jobId, p.processed, p.failed)
          this.pushProgress(p.jobId, p.processed + p.failed, input.tracks.length, p.failed)
          break
        }

        case 'complete': {
          cleanup()
          this.repository.completeJob(input.jobId)
          this.pushProgress(input.jobId, input.tracks.length, input.tracks.length, failed)
          this.pushChanged(
            input.tracks.map((track) => track.trackId),
            this.getChangedReason(input.jobId),
          )
          break
        }

        case 'fatal': {
          cleanup()
          this.repository.completeJob(input.jobId, message.payload.reason)
          this.pushProgress(input.jobId, 0, input.tracks.length, input.tracks.length, 'failed')
          break
        }
      }
    })

    worker.on('error', (error) => {
      cleanup()
      this.repository.completeJob(input.jobId, error.message)
      this.pushProgress(input.jobId, 0, input.tracks.length, input.tracks.length, 'failed')
    })

    worker.on('exit', (code) => {
      // Only handle unexpected exit — normal completion is handled by the
      // 'complete' or 'fatal' message handlers which call cleanup() first.
      if (this.activeJobId === input.jobId && code !== 0) {
        cleanup()
        this.repository.completeJob(input.jobId, `Worker exited unexpectedly (code ${code})`)
        this.pushProgress(input.jobId, 0, input.tracks.length, input.tracks.length, 'failed')
      }
    })
  }

  private pushProgress(
    jobId: number,
    processedTracks: number,
    totalTracks: number,
    failedTracks: number,
    overrideStatus?: 'running' | 'completed' | 'failed',
  ): void {
    const status = overrideStatus ?? (processedTracks >= totalTracks ? 'completed' : 'running')
    const progress: MetadataRefreshProgress = {
      jobId,
      status: status as 'running' | 'completed' | 'failed',
      totalTracks,
      processedTracks,
      failedTracks,
    }

    this.sendToRenderer('metadata:refresh-progress', progress)
  }

  private isMissingFileFailure(reason: string): boolean {
    return /\bENOENT\b|no such file or directory/i.test(reason)
  }

  private getChangedReason(jobId: number): 'metadata-refresh' | 'file-change' {
    const job = this.repository.getJobById(jobId)

    return job?.scope === 'file-change' ? 'file-change' : 'metadata-refresh'
  }

  private pushChanged(trackIds: number[], reason: 'metadata-refresh' | 'file-change'): void {
    this.sendToRenderer('library:changed', {
      trackIds: [...new Set(trackIds)],
      filePaths: [],
      reason,
    })
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

  async updateTrackMetadata(metadata: EditableTrackMetadata) {
    const filePath = this.repository.getTrackFilePath(metadata.trackId)

    if (!filePath) {
      throw new Error(`Audio file not found for track ${metadata.trackId}`)
    }

    await writeAudioTags(filePath, metadata)
    // Suppress watch refresh BEFORE DB write so a concurrent flush cannot race.
    this.onTagWriteSuccess?.(filePath)
    this.repository.updateUserEditedMetadata(metadata)
    return { ok: true }
  }
}
