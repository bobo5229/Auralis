import { Worker } from 'node:worker_threads'
import { stat } from 'node:fs/promises'
import { statSync } from 'node:fs'
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
import {
  DatabaseWriteAdmissionError,
  type DatabaseWriteAdmission,
} from '@main/database/databaseWriteAdmission'
import { isCurrentScanSnapshot } from '../libraryScan/libraryScanSnapshot'
import {
  closeWorkerMessageCredits,
  createWorkerMessageCredits,
  releaseWorkerMessageCredit,
} from '@main/shared/workerMessageCredits'

function getWorkerPath(): string {
  return join(__dirname, 'features/metadata/metadataRefreshWorker.js')
}

export type { MetadataRefreshProgress } from './metadataRefreshTypes'

export class MetadataRefreshWorkerHost {
  private activeWorker: Worker | null = null
  private activeJobId: number | null = null
  private activeJobFinalizer:
    | ((reason: string, interrupted?: boolean) => void | Promise<void>)
    | null = null
  private readonly pendingMessages = new Set<Promise<void>>()
  private pendingFinalization: (() => void) | null = null
  private termination: Promise<number> | null = null
  private terminationFailed = false
  private readonly exitedWorkers = new WeakSet<Worker>()

  constructor(
    private readonly repository: MetadataRefreshRepository,
    private readonly events: MetadataRefreshEvents,
    private readonly onIdle: () => void,
    private readonly writeAdmission?: DatabaseWriteAdmission,
  ) {}

  get jobId(): number | null {
    return this.activeJobId
  }

  recoverPendingFinalizationAdmitted(): void {
    const finalize = this.pendingFinalization
    if (!finalize) return
    if (this.termination || this.terminationFailed)
      throw new Error('Metadata refresh termination is not confirmed')
    finalize()
    if (this.pendingFinalization === finalize) this.pendingFinalization = null
  }

  async shutdown(reason = 'Application shutdown interrupted refresh'): Promise<void> {
    const worker = this.activeWorker
    const jobId = this.activeJobId
    const finalize = this.activeJobFinalizer
    this.activeWorker = null
    this.activeJobId = null
    this.activeJobFinalizer = null
    if (worker) {
      try {
        await (this.termination ?? worker.terminate())
        this.termination = null
        this.terminationFailed = false
      } catch (error) {
        if (!this.exitedWorkers.has(worker)) {
          this.terminationFailed = true
          this.activeWorker = worker
          this.activeJobId = jobId
          this.activeJobFinalizer = finalize
          throw error
        }
        // Exit confirms the connection/worker is gone even if terminate rejected.
        // Results ignored during interruption cannot justify normal completion;
        // drain them, then persist the interrupted terminal below.
        this.termination = null
        this.terminationFailed = false
      }
    }
    while (this.pendingMessages.size > 0) await Promise.allSettled([...this.pendingMessages])
    try {
      if (this.pendingFinalization) {
        if (this.writeAdmission)
          await this.writeAdmission.runWrite(() => this.recoverPendingFinalizationAdmitted())
        else this.recoverPendingFinalizationAdmitted()
      } else await finalize?.(reason, true)
      if (!this.activeWorker && this.activeJobId === jobId) {
        this.activeJobId = null
        this.activeJobFinalizer = null
      }
    } catch (error) {
      // The worker is already terminated, but retain its finalizer for a safe retry.
      this.activeJobId = jobId
      this.activeJobFinalizer = finalize
      throw error
    }
  }

  start(input: MetadataRefreshWorkerInput): void {
    const changedReason = this.getChangedReason(input.jobId)
    const messageCredits = createWorkerMessageCredits(32)
    const worker = new Worker(getWorkerPath(), {
      workerData: { ...input, messageCredits },
    })

    this.activeWorker = worker
    this.activeJobId = input.jobId

    let failed = 0
    let committed = 0
    const expectedTracks = new Map(input.tracks.map((track) => [track.trackId, track]))
    const committedTrackIds: number[] = []
    let terminal = false
    let messages = Promise.resolve()
    let progressTimer: ReturnType<typeof setTimeout> | null = null
    let lastProgress: { committed: number; failed: number } | null = null

    const cleanup = (): void => {
      closeWorkerMessageCredits(messageCredits)
      if (this.activeWorker === worker) {
        this.activeWorker = null
        this.activeJobId = null
        this.activeJobFinalizer = null
        queueMicrotask(() => this.onIdle())
      }
    }

    const finalizeNow = (reason?: string, interrupted = false): void => {
      if (
        terminal ||
        (!interrupted && (this.activeWorker !== worker || this.activeJobId !== input.jobId))
      )
        return
      if (progressTimer) clearTimeout(progressTimer)
      progressTimer = null
      const recordError = (error: unknown): void => {
        logger.error({ err: error, jobId: input.jobId }, 'Metadata refresh finalization failed')
      }
      this.repository.updateJobProgress(input.jobId, committed, failed)
      if (reason === undefined) this.repository.completeJob(input.jobId)
      else this.repository.completeJob(input.jobId, reason)
      terminal = true
      try {
        // A job failure does not roll back metadata already committed to the library.
        try {
          if (committedTrackIds.length) this.pushChanged(committedTrackIds, changedReason)
        } catch (error) {
          recordError(error)
        }
        try {
          this.pushProgress(
            input.jobId,
            committed + failed,
            input.tracks.length,
            failed,
            reason === undefined ? 'completed' : 'failed',
          )
        } catch (error) {
          recordError(error)
        }
      } finally {
        cleanup()
      }
    }
    const write = <T>(operation: () => T): T | Promise<T> =>
      this.writeAdmission ? this.writeAdmission.runWriteMaybe(operation) : operation()
    const finalize = (reason?: string, interrupted = false): void | Promise<void> => {
      if (this.pendingFinalization) return
      return write(() => finalizeNow(reason, interrupted))
    }
    this.activeJobFinalizer = finalize

    const handleMessage = async (message: MetadataRefreshWorkerMessage): Promise<void> => {
      if (
        this.pendingFinalization ||
        this.activeWorker !== worker ||
        this.activeJobId !== input.jobId
      )
        return
      switch (message.type) {
        case 'result': {
          const r = message.payload
          try {
            const matches = () =>
              r.jobId === input.jobId &&
              expectedTracks.get(r.trackId)?.filePath === r.sourceFilePath &&
              this.activeWorker === worker &&
              (input.writeMode === 'legacy-ttml'
                ? this.repository.getLegacyTtmlFilePath(r.trackId)
                : this.repository.getTrackFilePath(r.trackId)) === r.sourceFilePath
            if (!matches()) throw new Error('Stale metadata result or changed track identity')
            await assertMetadataFingerprint(r)
            await write(() => {
              if (!matches()) throw new Error('Stale metadata result or changed track identity')
              if (
                this.writeAdmission &&
                !isCurrentScanSnapshot({ ...r, filePath: r.sourceFilePath }, true)
              )
                throw new Error('Metadata source changed before commit')
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
            })
          } catch (error) {
            if (error instanceof DatabaseWriteAdmissionError) throw error
            const reason = error instanceof Error ? error.message : 'Metadata commit failed'
            await write(() => {
              if (this.activeWorker !== worker || this.activeJobId !== input.jobId) return
              failed++
              this.repository.addFailure(input.jobId, r.trackId, r.sourceFilePath, reason)
            })
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
          const matches = () =>
            this.activeWorker === worker &&
            this.activeJobId === input.jobId &&
            this.repository.getTrackFilePath(f.trackId) === f.filePath
          const confirmedMissing =
            input.writeMode !== 'legacy-ttml' &&
            this.isMissingFileFailure(f.reason) &&
            matches() &&
            (await this.isConfirmedMissing(f.filePath))
          await write(() => {
            if (this.activeWorker !== worker || this.activeJobId !== input.jobId) return
            failed += 1
            let stillMissing = confirmedMissing
            if (stillMissing && this.writeAdmission) {
              try {
                statSync(f.filePath)
                stillMissing = false
              } catch (error) {
                const code = (error as NodeJS.ErrnoException).code
                stillMissing = code === 'ENOENT' || code === 'ENOTDIR'
              }
            }
            if (stillMissing && matches()) {
              this.repository.markTrackMissing(f.trackId)
              this.pushChanged([f.trackId], 'track-missing')
            } else {
              this.repository.addFailure(f.jobId, f.trackId, f.filePath, f.reason)
            }
          })

          break
        }

        case 'progress': {
          if (!progressTimer) {
            progressTimer = setTimeout(() => {
              progressTimer = null
              enqueue(() =>
                write(() => {
                  if (terminal || this.activeWorker !== worker || this.activeJobId !== input.jobId)
                    return
                  if (lastProgress?.committed === committed && lastProgress.failed === failed)
                    return
                  this.repository.updateJobProgress(input.jobId, committed, failed)
                  this.pushProgress(
                    input.jobId,
                    committed + failed,
                    input.tracks.length,
                    failed,
                    'running',
                  )
                  lastProgress = { committed, failed }
                }),
              )
            }, 200)
          }
          break
        }

        case 'complete': {
          await finalize()
          break
        }

        case 'fatal': {
          await finalize(message.payload.reason)
          break
        }
      }
    }

    const enqueue = (operation: () => Promise<void> | void): void => {
      messages = messages.then(operation).catch(async (error: unknown) => {
        logger.error({ err: error, jobId: input.jobId }, 'Metadata message processing failed')
        try {
          await finalize(error instanceof Error ? error.message : 'Metadata commit failed')
        } catch (finalizeError) {
          logger.error(
            { err: finalizeError, jobId: input.jobId },
            'Unable to persist metadata refresh failure',
          )
          if (!terminal && this.activeWorker === worker && this.activeJobId === input.jobId) {
            if (progressTimer) clearTimeout(progressTimer)
            const reason = error instanceof Error ? error.message : 'Metadata commit failed'
            this.pendingFinalization = () => finalizeNow(reason, true)
            const termination = worker.terminate()
            this.termination = termination
            void termination.then(
              () => {
                if (this.termination === termination) this.termination = null
              },
              (terminateError: unknown) => {
                if (this.termination === termination) this.termination = null
                this.terminationFailed = true
                logger.error(
                  { err: terminateError, jobId: input.jobId },
                  'Unable to terminate metadata worker',
                )
              },
            )
            this.writeAdmission?.onAvailable(() => {
              void termination
                .then(async () => {
                  if (this.pendingFinalization)
                    await this.writeAdmission!.runWrite(() =>
                      this.recoverPendingFinalizationAdmitted(),
                    )
                })
                .catch((recoveryError: unknown) =>
                  logger.error(
                    { err: recoveryError, jobId: input.jobId },
                    'Unable to recover metadata refresh finalization',
                  ),
                )
            })
          }
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
      enqueue(async () => {
        await handleMessage(message)
        if (message.sequence !== undefined) releaseWorkerMessageCredit(messageCredits)
      }),
    )

    worker.on('error', (error) =>
      enqueue(() => {
        return finalize(error.message)
      }),
    )

    worker.on('exit', (code) => {
      this.exitedWorkers.add(worker)
      enqueue(() => {
        // Only handle unexpected exit — normal completion is handled by the
        // 'complete' or 'fatal' message handlers which call cleanup() first.
        return finalize(`Worker exited unexpectedly (code ${code})`)
      })
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
