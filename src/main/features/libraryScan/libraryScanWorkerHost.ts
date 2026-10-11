import { Worker, type WorkerOptions } from 'node:worker_threads'
import { join } from 'node:path'
import { logger } from '@main/logging/logger'
import type { LibraryScanWorkerInput, LibraryScanWorkerMessage } from './libraryScanTypes'

export type LibraryScanWorkerFactory = (fileName: string, options: WorkerOptions) => Worker

interface WorkerCallbacks {
  onMessage: (message: LibraryScanWorkerMessage, jobId: number) => void
  onFailure: (jobId: number, reason: string) => void
  onClear: () => void
  onEnd: () => void | Promise<void>
}

export class LibraryScanWorkerHost {
  private activeWorker: Worker | null = null
  private jobId: number | null = null
  private terminating = false
  private readonly deferredEvents: Array<() => void> = []
  private cleanup: Promise<void> | null = null

  constructor(
    private readonly createWorker: LibraryScanWorkerFactory,
    private readonly callbacks: WorkerCallbacks,
  ) {}

  get activeJobId(): number | null {
    return this.jobId
  }

  isActive(): boolean {
    return this.activeWorker !== null || this.jobId !== null
  }

  prepare(jobId: number): void {
    this.jobId = jobId
    this.terminating = false
  }

  waitForCleanup(): Promise<void> | null {
    return this.cleanup
  }

  /** Keep ownership until the lifecycle hook has finished resuming other writers. */
  finish(jobId: number): Promise<void> {
    if (this.jobId !== jobId) return Promise.resolve()
    if (this.cleanup) return this.cleanup
    this.activeWorker = null
    this.deferredEvents.length = 0
    this.callbacks.onClear()
    const release = (): void => {
      if (this.jobId === jobId) this.jobId = null
      this.cleanup = null
      this.terminating = false
    }
    try {
      const ending = this.callbacks.onEnd()
      if (!ending) {
        release()
        return Promise.resolve()
      }
      this.cleanup = Promise.resolve(ending)
        .catch((error) => {
          logger.error({ error, jobId }, 'Failed to end library scan lifecycle')
        })
        .finally(release)
      return this.cleanup
    } catch (error) {
      logger.error({ error, jobId }, 'Failed to end library scan lifecycle')
      release()
      return Promise.resolve()
    }
  }

  async terminate(jobId: number): Promise<boolean> {
    if (this.jobId !== jobId || this.cleanup) return false
    const worker = this.activeWorker
    this.terminating = true
    try {
      // A prepared job has no worker yet. Its preparation is drained by the service.
      if (worker) await worker.terminate()
    } catch (error) {
      this.terminating = false
      // Cancellation failed: preserve inventory and terminal events received while
      // terminate was pending so the original scan can continue or finish normally.
      for (const event of this.deferredEvents.splice(0)) event()
      throw error
    }
    return true
  }

  start(input: LibraryScanWorkerInput): void {
    const jobId = input.jobId
    const workerPath = join(__dirname, 'features/libraryScan/libraryScanWorker.js')
    const worker = this.createWorker(workerPath, { workerData: input })
    this.activeWorker = worker
    // Terminal settlement and lifecycle cleanup are scoped to this worker so a
    // late event can neither settle twice nor clear a newer scan.
    let terminalSettled = false
    const clearWorkerState = (): void => {
      if (this.activeWorker === worker && this.jobId === jobId) {
        void this.finish(jobId)
      }
    }

    const settleFailed = (reason: string, error?: unknown): void => {
      if (terminalSettled || this.terminating || this.activeWorker !== worker) {
        return
      }

      terminalSettled = true
      logger.error({ error, jobId }, reason)

      try {
        this.callbacks.onFailure(jobId, reason)
      } catch (settlementError) {
        logger.error({ error: settlementError, jobId }, 'Failed to persist scan failure status')
      } finally {
        clearWorkerState()
      }
    }

    const dispatch = (event: () => void): void => {
      if (terminalSettled || this.activeWorker !== worker || this.jobId !== jobId) return
      if (this.terminating) this.deferredEvents.push(() => dispatch(event))
      else event()
    }

    worker.on('message', (message: LibraryScanWorkerMessage) => {
      dispatch(() => {
        const isTerminal = message.type === 'complete' || message.type === 'fatal'
        try {
          this.callbacks.onMessage(message, jobId)
          if (isTerminal) {
            terminalSettled = true
            clearWorkerState()
          }
        } catch (error) {
          const reason =
            error instanceof Error ? error.message : 'Unknown error while processing worker message'
          settleFailed(`Failed to finalize library scan: ${reason}`, error)
        }
      })
    })

    worker.on('error', (error) => {
      dispatch(() => settleFailed(error.message, error))
    })

    worker.on('exit', (code) => {
      // Defer so any already-queued terminal message handlers run first.
      setImmediate(() => {
        if (terminalSettled || this.jobId !== jobId) {
          return
        }

        const reason =
          code === 0
            ? 'Worker exited without completing the scan'
            : `Worker exited with code ${code}`
        dispatch(() => settleFailed(reason))
      })
    })
  }
}
