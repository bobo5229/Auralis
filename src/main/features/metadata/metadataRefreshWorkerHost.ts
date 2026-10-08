import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import type { MetadataRefreshRepository } from '@main/repositories/metadataRefreshRepository'
import type { RendererEventSender } from '@main/ipc/rendererEvents'
import type {
  MetadataRefreshWorkerInput,
  MetadataRefreshWorkerMessage,
} from './metadataRefreshTypes'
import { assertMetadataFingerprint } from './readStableMetadata'
import { logger } from '@main/logging/logger'

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

interface MetadataWriteState {
  generationFor: (trackId: number) => number
  isWriting: (trackId: number) => boolean
}

export class MetadataRefreshWorkerHost {
  private activeWorker: Worker | null = null
  private activeJobId: number | null = null
  private readonly pendingMessages = new Set<Promise<void>>()

  constructor(
    private readonly repository: MetadataRefreshRepository,
    private readonly sendToRenderer: RendererEventSender,
    private readonly writes: MetadataWriteState,
    private readonly onIdle: () => void,
  ) {}

  get jobId(): number | null {
    return this.activeJobId
  }

  async shutdown(): Promise<void> {
    const worker = this.activeWorker
    const jobId = this.activeJobId
    this.activeWorker = null
    this.activeJobId = null
    if (worker) {
      try {
        await worker.terminate()
      } catch (error) {
        this.activeWorker = worker
        this.activeJobId = jobId
        throw error
      }
    }
    while (this.pendingMessages.size > 0) await Promise.allSettled([...this.pendingMessages])
    if (jobId !== null)
      this.repository.completeJob(jobId, 'Application shutdown interrupted refresh')
  }

  start(input: MetadataRefreshWorkerInput): void {
    input = {
      ...input,
      tracks: input.tracks.map((track) => ({
        ...track,
        generation: this.writes.generationFor(track.trackId),
      })),
    }
    const worker = new Worker(getWorkerPath(), {
      workerData: input,
    })

    this.activeWorker = worker
    this.activeJobId = input.jobId

    let failed = 0
    let committed = 0
    const expectedTracks = new Map(input.tracks.map((track) => [track.trackId, track]))
    const committedTrackIds: number[] = []
    let messages = Promise.resolve()

    const cleanup = (): void => {
      if (this.activeWorker === worker) {
        this.activeWorker = null
        this.activeJobId = null
        queueMicrotask(() => this.onIdle())
      }
    }

    const handleMessage = async (message: MetadataRefreshWorkerMessage): Promise<void> => {
      if (this.activeWorker !== worker || this.activeJobId !== input.jobId) return
      switch (message.type) {
        case 'result': {
          const r = message.payload
          try {
            const matches = () =>
              r.jobId === input.jobId &&
              expectedTracks.get(r.trackId)?.filePath === r.sourceFilePath &&
              expectedTracks.get(r.trackId)?.generation === r.generation &&
              r.generation === this.writes.generationFor(r.trackId) &&
              !this.writes.isWriting(r.trackId) &&
              this.activeWorker === worker &&
              this.repository.getTrackFilePath(r.trackId) === r.sourceFilePath
            if (!matches()) throw new Error('Stale metadata result or changed track identity')
            await assertMetadataFingerprint(r)
            if (!matches()) throw new Error('Stale metadata result or changed track identity')
            if (input.writeMode === 'lyrics') this.repository.updateTrackLyrics(r)
            else this.repository.updateTrackMetadata(r)
            committed++
            committedTrackIds.push(r.trackId)
          } catch (error) {
            failed++
            const reason = error instanceof Error ? error.message : 'Metadata commit failed'
            this.repository.addFailure(input.jobId, r.trackId, r.sourceFilePath, reason)
            logger.warn(
              { err: error, jobId: input.jobId, trackId: r.trackId },
              'Metadata result was not committed',
            )
          }
          break
        }

        case 'failure': {
          const f = message.payload

          const source = expectedTracks.get(f.trackId)
          if (f.jobId !== input.jobId || !source || source.filePath !== f.filePath) break
          if (
            this.isMissingFileFailure(f.reason) &&
            source.generation === this.writes.generationFor(f.trackId) &&
            !this.writes.isWriting(f.trackId) &&
            this.repository.getTrackFilePath(f.trackId) === f.filePath
          ) {
            this.repository.markTrackMissing(f.trackId)
            this.pushChanged([f.trackId], 'track-missing')
          } else {
            this.repository.addFailure(f.jobId, f.trackId, f.filePath, f.reason)
          }

          failed += 1
          break
        }

        case 'progress': {
          this.repository.updateJobProgress(input.jobId, committed, failed)
          this.pushProgress(input.jobId, committed + failed, input.tracks.length, failed, 'running')
          break
        }

        case 'complete': {
          this.repository.updateJobProgress(input.jobId, committed, failed)
          this.repository.completeJob(input.jobId)
          this.pushProgress(
            input.jobId,
            committed + failed,
            input.tracks.length,
            failed,
            'completed',
          )
          if (committedTrackIds.length)
            this.pushChanged(committedTrackIds, this.getChangedReason(input.jobId))
          cleanup()
          break
        }

        case 'fatal': {
          cleanup()
          this.repository.completeJob(input.jobId, message.payload.reason)
          this.pushProgress(input.jobId, 0, input.tracks.length, input.tracks.length, 'failed')
          break
        }
      }
    }

    const enqueue = (operation: () => Promise<void> | void): void => {
      messages = messages.then(operation).catch((error: unknown) => {
        logger.error({ err: error, jobId: input.jobId }, 'Metadata message processing failed')
        if (this.activeWorker === worker) {
          cleanup()
          this.repository.completeJob(
            input.jobId,
            error instanceof Error ? error.message : 'Metadata commit failed',
          )
          this.pushProgress(input.jobId, committed + failed, input.tracks.length, failed, 'failed')
        }
      })
      const pending = messages
      this.pendingMessages.add(pending)
      void pending.then(
        () => this.pendingMessages.delete(pending),
        () => this.pendingMessages.delete(pending),
      )
    }
    worker.on('message', (message: MetadataRefreshWorkerMessage) =>
      enqueue(() => handleMessage(message)),
    )

    worker.on('error', (error) =>
      enqueue(() => {
        if (this.activeWorker !== worker) return
        cleanup()
        this.repository.completeJob(input.jobId, error.message)
        this.pushProgress(input.jobId, 0, input.tracks.length, input.tracks.length, 'failed')
      }),
    )

    worker.on('exit', (code) =>
      enqueue(() => {
        // Only handle unexpected exit — normal completion is handled by the
        // 'complete' or 'fatal' message handlers which call cleanup() first.
        if (this.activeWorker === worker && this.activeJobId === input.jobId) {
          cleanup()
          this.repository.completeJob(input.jobId, `Worker exited unexpectedly (code ${code})`)
          this.pushProgress(input.jobId, 0, input.tracks.length, input.tracks.length, 'failed')
        }
      }),
    )
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

  private pushChanged(
    trackIds: number[],
    reason: 'metadata-refresh' | 'file-change' | 'track-missing',
  ): void {
    this.sendToRenderer('library:changed', {
      trackIds: [...new Set(trackIds)],
      filePaths: [],
      reason,
    })
  }
}
