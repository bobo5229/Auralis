import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import { MetadataRefreshRepository } from '../../repositories/metadataRefreshRepository'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import type {
  MetadataRefreshWorkerInput,
  MetadataRefreshWorkerMessage,
} from './metadataRefreshTypes'

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

  constructor(
    private readonly repository: MetadataRefreshRepository,
    private readonly artworkCacheDir: string,
    private readonly sendToRenderer: (channel: string, data: unknown) => void,
  ) {
    this.repository.markInterruptedJobs()
  }

  refreshMissingMetadata(limit = 5000): { jobId: number } {
    const activeJob = this.repository.getActiveJob()
    if (activeJob) {
      throw new Error(`A refresh job is already running (job ${activeJob.id})`)
    }

    const tracks = this.repository.getTracksWithMissingMetadata(limit)

    if (tracks.length === 0) {
      throw new Error('No tracks with missing metadata found')
    }

    const jobId = this.repository.createJob('missing-metadata', tracks.length)
    this.activeJobId = jobId

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
    const activeJob = this.repository.getActiveJob()
    if (activeJob) {
      throw new Error(`A refresh job is already running (job ${activeJob.id})`)
    }

    const tracks = this.repository.getTracksByIds(trackIds)

    if (tracks.length === 0) {
      throw new Error('No matching tracks found')
    }

    const jobId = this.repository.createJob('tracks', tracks.length)
    this.activeJobId = jobId

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
    const activeJob = this.repository.getActiveJob()
    if (activeJob) {
      throw new Error(`A refresh job is already running (job ${activeJob.id})`)
    }

    const tracks = this.repository.getTracksWithMissingLyrics(limit)

    if (tracks.length === 0) {
      throw new Error('No tracks with missing lyrics found')
    }

    const jobId = this.repository.createJob('missing-lyrics', tracks.length)
    this.activeJobId = jobId

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

    let failed = 0

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
          this.repository.addFailure(f.jobId, f.trackId, f.filePath, f.reason)
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
          this.repository.completeJob(input.jobId)
          this.pushProgress(input.jobId, input.tracks.length, input.tracks.length, failed)
          this.activeWorker = null
          this.activeJobId = null
          break
        }

        case 'fatal': {
          this.repository.completeJob(input.jobId, message.payload.reason)
          this.pushProgress(input.jobId, 0, input.tracks.length, input.tracks.length, 'failed')
          this.activeWorker = null
          this.activeJobId = null
          break
        }
      }
    })

    worker.on('error', (error) => {
      this.repository.completeJob(input.jobId, error.message)
      this.pushProgress(input.jobId, 0, input.tracks.length, input.tracks.length, 'failed')
      this.activeWorker = null
      this.activeJobId = null
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

  getJobStatus(jobId: number) {
    return this.repository.getJobById(jobId)
  }

  listFailures(limit?: number) {
    return this.repository.listFailures(limit)
  }

  getTrackMetadata(trackId: number) {
    return this.repository.getEditableTrackMetadata(trackId)
  }

  updateTrackMetadata(metadata: EditableTrackMetadata) {
    this.repository.updateUserEditedMetadata(metadata)
    return { ok: true }
  }
}
