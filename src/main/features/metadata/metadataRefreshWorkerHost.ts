import { Worker } from 'node:worker_threads'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { MetadataRefreshRepository } from '@main/repositories/metadataRefreshRepository'
import type { MetadataRefreshEvents } from './metadataRefreshEvents'
import type {
  MetadataRefreshProgress,
  MetadataRefreshWorkerInput,
  MetadataRefreshWorkerMessage,
} from './metadataRefreshTypes'
import { assertMetadataFingerprint } from './readStableMetadata'
import { getLyricsSidecarFingerprintSync } from './resolveLyricsForFile'
import { logger } from '@main/logging/logger'

function getWorkerPath(): string {
  return join(__dirname, 'features/metadata/metadataRefreshWorker.js')
}

export type { MetadataRefreshProgress } from './metadataRefreshTypes'

interface MetadataWriteState {
  generationFor: (trackId: number) => number
  isWriting: (trackId: number) => boolean
}

export class MetadataRefreshWorkerHost {
  private activeWorker: Worker | null = null
  private activeJobId: number | null = null
  private activeJobFinalizer: ((reason: string, interrupted?: boolean) => void) | null = null
  private readonly pendingMessages = new Set<Promise<void>>()

  constructor(
    private readonly repository: MetadataRefreshRepository,
    private readonly events: MetadataRefreshEvents,
    private readonly writes: MetadataWriteState,
    private readonly onIdle: () => void,
  ) {}

  get jobId(): number | null {
    return this.activeJobId
  }

  async shutdown(): Promise<void> {
    const worker = this.activeWorker
    const jobId = this.activeJobId
    const finalize = this.activeJobFinalizer
    this.activeWorker = null
    this.activeJobId = null
    this.activeJobFinalizer = null
    if (worker) {
      try {
        await worker.terminate()
      } catch (error) {
        this.activeWorker = worker
        this.activeJobId = jobId
        this.activeJobFinalizer = finalize
        throw error
      }
    }
    while (this.pendingMessages.size > 0) await Promise.allSettled([...this.pendingMessages])
    finalize?.('Application shutdown interrupted refresh', true)
  }

  start(input: MetadataRefreshWorkerInput): void {
    input = {
      ...input,
      tracks: input.tracks.map((track) => ({
        ...track,
        generation: this.writes.generationFor(track.trackId),
      })),
    }
    const changedReason = this.getChangedReason(input.jobId)
    const worker = new Worker(getWorkerPath(), {
      workerData: input,
    })

    this.activeWorker = worker
    this.activeJobId = input.jobId

    let failed = 0
    let committed = 0
    const expectedTracks = new Map(input.tracks.map((track) => [track.trackId, track]))
    const committedTrackIds: number[] = []
    let terminal = false
    let messages = Promise.resolve()

    const cleanup = (): void => {
      if (this.activeWorker === worker) {
        this.activeWorker = null
        this.activeJobId = null
        this.activeJobFinalizer = null
        queueMicrotask(() => this.onIdle())
      }
    }

    const finalize = (reason?: string, interrupted = false): void => {
      if (
        terminal ||
        (!interrupted && (this.activeWorker !== worker || this.activeJobId !== input.jobId))
      )
        return
      terminal = true
      let terminalError = reason
      const recordError = (error: unknown, affectsStatus = true): void => {
        if (affectsStatus)
          terminalError ??= error instanceof Error ? error.message : 'Metadata commit failed'
        logger.error({ err: error, jobId: input.jobId }, 'Metadata refresh finalization failed')
      }
      try {
        try {
          this.repository.updateJobProgress(input.jobId, committed, failed)
        } catch (error) {
          recordError(error)
        }
        try {
          if (terminalError === undefined) this.repository.completeJob(input.jobId)
          else this.repository.completeJob(input.jobId, terminalError)
        } catch (error) {
          recordError(error)
        }
        // A job failure does not roll back metadata already committed to the library.
        try {
          if (committedTrackIds.length) this.pushChanged(committedTrackIds, changedReason)
        } catch (error) {
          recordError(error, false)
        }
        try {
          this.pushProgress(
            input.jobId,
            committed + failed,
            input.tracks.length,
            failed,
            terminalError === undefined ? 'completed' : 'failed',
          )
        } catch (error) {
          recordError(error, false)
        }
      } finally {
        cleanup()
      }
    }
    this.activeJobFinalizer = finalize

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
              (input.writeMode === 'legacy-ttml'
                ? this.repository.getLegacyTtmlFilePath(r.trackId)
                : this.repository.getTrackFilePath(r.trackId)) === r.sourceFilePath
            if (!matches()) throw new Error('Stale metadata result or changed track identity')
            await assertMetadataFingerprint(r)
            if (!matches()) throw new Error('Stale metadata result or changed track identity')
            if (input.writeMode === 'legacy-ttml') {
              if (
                !r.lyricsSidecarFingerprint ||
                r.lyricsSidecarFingerprint !== getLyricsSidecarFingerprintSync(r.sourceFilePath)
              )
                throw new Error('Lyrics sidecar changed before commit')
              if (!this.repository.updateLegacyTtmlLyrics(r, r.lyricsSidecarFingerprint))
                throw new Error('Legacy lyrics already changed')
            } else if (input.writeMode === 'lyrics') this.repository.updateTrackLyrics(r)
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
          failed += 1
          const matches = () =>
            this.activeWorker === worker &&
            this.activeJobId === input.jobId &&
            source.generation === this.writes.generationFor(f.trackId) &&
            !this.writes.isWriting(f.trackId) &&
            this.repository.getTrackFilePath(f.trackId) === f.filePath
          if (
            input.writeMode !== 'legacy-ttml' &&
            this.isMissingFileFailure(f.reason) &&
            matches() &&
            (await this.isConfirmedMissing(f.filePath)) &&
            matches()
          ) {
            this.repository.markTrackMissing(f.trackId)
            this.pushChanged([f.trackId], 'track-missing')
          } else {
            this.repository.addFailure(f.jobId, f.trackId, f.filePath, f.reason)
          }

          break
        }

        case 'progress': {
          this.repository.updateJobProgress(input.jobId, committed, failed)
          this.pushProgress(input.jobId, committed + failed, input.tracks.length, failed, 'running')
          break
        }

        case 'complete': {
          finalize()
          break
        }

        case 'fatal': {
          finalize(message.payload.reason)
          break
        }
      }
    }

    const enqueue = (operation: () => Promise<void> | void): void => {
      messages = messages.then(operation).catch((error: unknown) => {
        logger.error({ err: error, jobId: input.jobId }, 'Metadata message processing failed')
        finalize(error instanceof Error ? error.message : 'Metadata commit failed')
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
        finalize(error.message)
      }),
    )

    worker.on('exit', (code) =>
      enqueue(() => {
        // Only handle unexpected exit — normal completion is handled by the
        // 'complete' or 'fatal' message handlers which call cleanup() first.
        finalize(`Worker exited unexpectedly (code ${code})`)
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

    this.events.refreshProgress(progress)
  }

  private isMissingFileFailure(reason: string): boolean {
    return /\bENOENT\b|\bENOTDIR\b|no such file or directory/i.test(reason)
  }

  private async isConfirmedMissing(filePath: string): Promise<boolean> {
    try {
      await stat(filePath)
      return false
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      return code === 'ENOENT' || code === 'ENOTDIR'
    }
  }

  private getChangedReason(jobId: number): 'metadata-refresh' | 'file-change' {
    const job = this.repository.getJobById(jobId)

    return job?.scope === 'file-change' ? 'file-change' : 'metadata-refresh'
  }

  private pushChanged(
    trackIds: number[],
    reason: 'metadata-refresh' | 'file-change' | 'track-missing',
  ): void {
    this.events.libraryChanged({
      trackIds: [...new Set(trackIds)],
      filePaths: [],
      reason,
    })
  }
}
