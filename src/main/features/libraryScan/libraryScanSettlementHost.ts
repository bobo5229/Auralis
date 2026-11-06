import { Worker, type WorkerOptions } from 'node:worker_threads'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { DatabaseWriteAdmission } from '@main/database/databaseWriteAdmission'
import { ScanJobRepository } from '@main/repositories/scanJobRepository'
import { logger } from '@main/logging/logger'
import type { LibraryScanEvents } from './libraryScanEvents'
import {
  SCAN_SETTLEMENT_ACTIVE,
  SCAN_SETTLEMENT_CANCEL,
  type ScanSettlementEvent,
  type ScanSettlementInput,
  type ScanSettlementReply,
  type ScanSettlementSnapshot,
} from './libraryScanSettlementTypes'

interface Options {
  workerPath?: string
  timeoutMs?: number
  createWorker?: (path: string, options: WorkerOptions) => Worker
}
interface ActiveSettlement {
  jobId: number
  state: SharedArrayBuffer
  worker: Worker | null
  exited: boolean
  lease: { release(): void } | null
  events: ScanSettlementEvent[] | null
  error: string
  running: boolean
  task: Promise<void> | null
}

/** Owns the exclusive lease until the settlement connection is confirmed closed. */
export class LibraryScanSettlementHost {
  private readonly jobs: ScanJobRepository
  private active: ActiveSettlement | null = null
  private stopping = false

  constructor(
    private readonly db: Database.Database,
    private readonly admission: DatabaseWriteAdmission,
    private readonly events: LibraryScanEvents,
    private readonly options: Options = {},
  ) {
    this.jobs = new ScanJobRepository(db)
  }

  isActive(): boolean {
    return this.active !== null
  }
  owns(jobId: number): boolean {
    return this.active?.jobId === jobId
  }

  settle(
    jobId: number,
    snapshot: ScanSettlementSnapshot,
    complete: ScanSettlementInput['complete'],
  ): Promise<void> {
    if (this.active) {
      if (this.active.jobId !== jobId)
        return Promise.reject(new Error('Another scan settlement is active'))
      return this.wait(jobId)
    }
    if (this.stopping) return Promise.reject(new Error('Scan settlement host is shutting down'))
    if (!this.db.name || this.db.name === ':memory:')
      return Promise.reject(new Error('Scan settlement requires a file database'))
    const active: ActiveSettlement = {
      jobId,
      state: new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT),
      worker: null,
      exited: false,
      lease: null,
      events: null,
      error: 'Scan settlement worker exited without completion',
      running: false,
      task: null,
    }
    this.active = active
    return this.track(active, async () => {
      try {
        active.lease = await this.admission.acquireExclusive()
        if (Atomics.load(new Int32Array(active.state), 0) !== SCAN_SETTLEMENT_CANCEL)
          await this.runWorker(active, {
            databasePath: this.db.name,
            jobId,
            snapshot,
            complete,
            state: active.state,
          })
      } catch (error) {
        active.error = error instanceof Error ? error.message : 'Unable to settle library scan'
        if (active.worker && !active.exited) throw error
      }
      await this.finish(active)
    })
  }

  requestCancel(jobId: number): boolean {
    const active = this.active
    return (
      !!active &&
      active.jobId === jobId &&
      Atomics.compareExchange(
        new Int32Array(active.state),
        0,
        SCAN_SETTLEMENT_ACTIVE,
        SCAN_SETTLEMENT_CANCEL,
      ) === SCAN_SETTLEMENT_ACTIVE
    )
  }

  wait(jobId: number): Promise<void> {
    const active = this.active
    if (!active || active.jobId !== jobId) return Promise.resolve()
    if (active.running) return active.task!
    return this.track(active, async () => {
      if (active.worker && !active.exited) {
        await active.worker.terminate()
        active.exited = true
      }
      await this.finish(active)
    })
  }

  recoverPending(): Promise<void> | null {
    return this.active && !this.active.running ? this.wait(this.active.jobId) : null
  }

  async shutdown(): Promise<void> {
    this.stopping = true
    const active = this.active
    if (!active) return
    this.requestCancel(active.jobId)
    await this.wait(active.jobId)
  }

  private track(active: ActiveSettlement, operation: () => Promise<void>): Promise<void> {
    active.running = true
    const task = operation().finally(() => {
      active.running = false
    })
    active.task = task
    return task
  }

  private runWorker(active: ActiveSettlement, input: ScanSettlementInput): Promise<void> {
    const create = this.options.createWorker ?? ((path, options) => new Worker(path, options))
    const worker = create(
      this.options.workerPath ??
        join(__dirname, 'features/libraryScan/libraryScanSettlementWorker.js'),
      { workerData: input },
    )
    active.worker = worker
    return new Promise((resolve, reject) => {
      let finished = false
      const finish = () => {
        if (!finished) {
          finished = true
          clearTimeout(timer)
          resolve()
        }
      }
      const timer = setTimeout(() => {
        active.error = 'Scan settlement worker timed out'
        // Termination rejection leaves the lease and worker owned for an explicit retry.
        void worker.terminate().then(
          () => {
            active.exited = true
            finish()
          },
          (error) => {
            clearTimeout(timer)
            if (!finished) {
              finished = true
              reject(error)
            }
          },
        )
      }, this.options.timeoutMs ?? 30_000)
      worker.on('message', (reply: ScanSettlementReply) => {
        if (this.active !== active) return
        if (reply.type === 'prepared') active.events = reply.events
        else if (reply.error) active.error = reply.error
      })
      worker.on('error', (error) => {
        active.error = error.message
      })
      worker.on('exit', (code) => {
        active.exited = true
        if (code !== 0 && active.error === 'Scan settlement worker exited without completion')
          active.error = `Scan settlement worker exited with code ${code}`
        finish()
      })
    })
  }

  private async finish(active: ActiveSettlement): Promise<void> {
    if (active.worker && !active.exited)
      throw new Error('Scan settlement connection is not confirmed closed')
    // Reconcile against the durable job, not the worker ACK or cancellation request.
    let status = this.jobs.getById(active.jobId)
    active.lease?.release()
    active.lease = null
    if (!status) throw new Error(`Scan settlement job disappeared: ${active.jobId}`)
    if (status.status === 'scanning') {
      const canceled = Atomics.load(new Int32Array(active.state), 0) === SCAN_SETTLEMENT_CANCEL
      await this.admission.runWrite(() => {
        if (canceled) this.jobs.finish(active.jobId, 'canceled')
        else this.jobs.fail(active.jobId, active.error)
      })
      status = this.jobs.getById(active.jobId)!
    }
    let events: ScanSettlementEvent[]
    if (status.status === 'completed') {
      if (!active.events) throw new Error('Committed scan settlement has no event draft')
      events = active.events
    } else
      events = [
        {
          type: 'progress',
          payload: {
            jobId: status.jobId,
            status: status.status,
            totalFiles: status.totalFiles,
            scannedFiles: status.scannedFiles,
            failedFiles: status.failedFiles,
            currentFile: null,
            message: status.status === 'canceled' ? 'Scan canceled' : status.errorMessage,
          },
        },
      ]
    // The terminal DB state is now confirmed. Notifications are best effort and
    // must not turn a committed job into a failed/canceled one on observer errors.
    this.active = null
    for (const event of events) {
      try {
        if (event.type === 'changed') this.events.changed(event.payload)
        else this.events.progress(event.payload)
      } catch (error) {
        logger.error({ error, jobId: active.jobId }, 'Unable to publish scan settlement event')
      }
    }
  }
}
