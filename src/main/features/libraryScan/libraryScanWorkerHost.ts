import { Worker, type WorkerOptions } from 'node:worker_threads'
import { join } from 'node:path'
import { logger } from '@main/logging/logger'
import type { LibraryScanWorkerInput, LibraryScanWorkerMessage } from './libraryScanTypes'
import type { DatabaseWriteAdmission } from '@main/database/databaseWriteAdmission'
import {
  closeWorkerMessageCredits,
  createWorkerMessageCredits,
  releaseWorkerMessageCredit,
} from '@main/shared/workerMessageCredits'

export type LibraryScanWorkerFactory = (fileName: string, options: WorkerOptions) => Worker

interface WorkerCallbacks {
  onMessage: (message: LibraryScanWorkerMessage, jobId: number) => void
  onComplete?: (
    message: Extract<LibraryScanWorkerMessage, { type: 'complete' }>,
    jobId: number,
  ) => Promise<void>
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
  private pendingFailureRecovery: (() => Promise<void>) | null = null
  private messageCredits: SharedArrayBuffer | null = null

  constructor(
    private readonly createWorker: LibraryScanWorkerFactory,
    private readonly callbacks: WorkerCallbacks,
    private readonly writeAdmission?: DatabaseWriteAdmission,
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

  retryPendingFailure(): Promise<void> | null {
    return this.pendingFailureRecovery?.() ?? null
  }

  /** Keep ownership until the lifecycle hook has finished resuming other writers. */
  finish(jobId: number): Promise<void> {
    if (this.jobId !== jobId) return Promise.resolve()
    if (this.cleanup) return this.cleanup
    this.activeWorker = null
    if (this.messageCredits) closeWorkerMessageCredits(this.messageCredits)
    this.messageCredits = null
    this.pendingFailureRecovery = null
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
    const messageCredits = createWorkerMessageCredits(16)
    this.messageCredits = messageCredits
    const worker = this.createWorker(workerPath, { workerData: { ...input, messageCredits } })
    this.activeWorker = worker
    // Terminal settlement and lifecycle cleanup are scoped to this worker so a
    // late event can neither settle twice nor clear a newer scan.
    let terminalSettled = false
    let recoveringFailure = false
    let externallySettling = false
    let workerExited = false
    const clearWorkerState = (): void => {
      if (this.activeWorker === worker && this.jobId === jobId) {
        void this.finish(jobId)
      }
    }

    type Event = () => void | Promise<void>
    const events: Event[] = []
    let processing = false
    const active = (): boolean =>
      !terminalSettled &&
      !recoveringFailure &&
      !externallySettling &&
      this.activeWorker === worker &&
      this.jobId === jobId
    const write = <T>(operation: () => T): T | Promise<T> =>
      this.writeAdmission ? this.writeAdmission.runWriteMaybe(operation) : operation()
    const enqueue = (event: Event): void => {
      events.push(event)
      drain()
    }
    const drain = (): void => {
      if (processing) return
      while (events.length) {
        const event = events.shift()!
        if (!active()) continue
        if (this.terminating) {
          this.deferredEvents.push(() => enqueue(event))
          continue
        }
        try {
          const result = event()
          if (result instanceof Promise) {
            processing = true
            void result.then(
              () => {
                processing = false
                drain()
              },
              (error: unknown) => {
                processing = false
                enqueue(() => settleFailed('Failed to process scan event', error))
                drain()
              },
            )
            return
          }
        } catch (error) {
          enqueue(() => settleFailed('Failed to process scan event', error))
        }
      }
    }
    const settleFailed = (reason: string, error?: unknown): void | Promise<void> => {
      if (!active() || this.terminating) return
      logger.error({ error, jobId }, reason)
      const fail = () => {
        if (!active()) return 'stale'
        if (this.terminating) return 'deferred'
        this.callbacks.onFailure(jobId, reason)
        return 'processed'
      }
      const complete = (result: string): void => {
        if (result === 'deferred') {
          if (this.terminating)
            this.deferredEvents.push(() => enqueue(() => settleFailed(reason, error)))
          else enqueue(() => settleFailed(reason, error))
        } else if (result === 'processed') {
          terminalSettled = true
          clearWorkerState()
        }
      }
      const failure = (settlementError: unknown): void => {
        logger.error({ error: settlementError, jobId }, 'Failed to persist scan failure status')
        if (this.activeWorker !== worker || this.jobId !== jobId || this.terminating) return
        recoveringFailure = true
        let stopped = false
        let recovery: Promise<void> | null = null
        const recover = (): Promise<void> => {
          if (recovery) return recovery
          const pending = (async () => {
            if (this.activeWorker !== worker || this.jobId !== jobId || this.terminating) return
            if (!stopped && !workerExited) {
              try {
                await worker.terminate()
              } catch (terminateError) {
                if (!workerExited) throw terminateError
              }
            }
            stopped = true
            if (this.activeWorker !== worker || this.jobId !== jobId || this.terminating) return
            await write(() => {
              if (this.activeWorker !== worker || this.jobId !== jobId || this.terminating) return
              this.callbacks.onFailure(jobId, reason)
              terminalSettled = true
              clearWorkerState()
            })
          })()
          const tracked = pending.finally(() => {
            if (recovery === tracked) recovery = null
          })
          recovery = tracked
          return tracked
        }
        this.pendingFailureRecovery = recover
        const recoverInBackground = (): void => {
          void recover().catch((recoveryError: unknown) =>
            logger.error({ error: recoveryError, jobId }, 'Failed to recover scan failure status'),
          )
        }
        recoverInBackground()
        this.writeAdmission?.onAvailable(recoverInBackground)
      }
      try {
        const result = write(fail)
        if (result instanceof Promise) return result.then(complete, failure)
        complete(result)
      } catch (settlementError) {
        failure(settlementError)
      }
    }
    worker.on('message', (message: LibraryScanWorkerMessage) => {
      const event: Event = () => {
        if (message.type === 'complete' && this.callbacks.onComplete) {
          if (!active()) return
          if (this.terminating) {
            this.deferredEvents.push(() => enqueue(event))
            return
          }
          externallySettling = true
          const settle = async (): Promise<void> => {
            if (this.activeWorker !== worker || this.jobId !== jobId) return
            try {
              // This callback acquires its own exclusive lease, outside a normal write.
              await this.callbacks.onComplete!(message, jobId)
            } catch (error) {
              this.pendingFailureRecovery = settle
              throw error
            }
            if (message.sequence !== undefined) releaseWorkerMessageCredit(messageCredits)
            terminalSettled = true
            externallySettling = false
            clearWorkerState()
          }
          return settle().catch((error) => {
            logger.error({ error, jobId }, 'Background scan settlement requires recovery')
          })
        }
        const process = () => {
          if (!active()) return 'stale'
          if (this.terminating) return 'deferred'
          this.callbacks.onMessage(message, jobId)
          return 'processed'
        }
        const complete = (result: string): void => {
          if (result !== 'deferred' && message.sequence !== undefined)
            releaseWorkerMessageCredit(messageCredits)
          if (result === 'deferred') {
            if (this.terminating) this.deferredEvents.push(() => enqueue(event))
            else enqueue(event)
          } else if (
            result === 'processed' &&
            (message.type === 'complete' || message.type === 'fatal')
          ) {
            terminalSettled = true
            clearWorkerState()
          }
        }
        const failure = (error: unknown): void | Promise<void> => {
          const reason =
            error instanceof Error ? error.message : 'Unknown error while processing worker message'
          return settleFailed(`Failed to finalize library scan: ${reason}`, error)
        }
        try {
          const result = write(process)
          if (result instanceof Promise) return result.then(complete, failure)
          complete(result)
        } catch (error) {
          return failure(error)
        }
      }
      enqueue(event)
    })
    worker.on('error', (error) => enqueue(() => settleFailed(error.message, error)))
    worker.on('exit', (code) => {
      workerExited = true
      setImmediate(() =>
        recoveringFailure
          ? void (
              this.activeWorker === worker && this.jobId === jobId
                ? this.retryPendingFailure()
                : null
            )?.catch((error: unknown) =>
              logger.error({ error, jobId }, 'Failed to recover exited scan worker'),
            )
          : enqueue(() => {
              if (terminalSettled || this.jobId !== jobId) return
              const reason =
                code === 0
                  ? 'Worker exited without completing the scan'
                  : `Worker exited with code ${code}`
              return settleFailed(reason)
            }),
      )
    })
  }
}
