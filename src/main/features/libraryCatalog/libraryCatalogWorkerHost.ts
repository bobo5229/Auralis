import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import { logger } from '@main/logging/logger'
import type { LibraryCatalogWorkerReply, LoadedLibraryCatalog } from './libraryCatalogWorkerTypes'

interface Options {
  workerPath?: string
  timeoutMs?: number
  idleMs?: number
}
interface Pending {
  id: number
  promise: Promise<LoadedLibraryCatalog>
  resolve: (catalog: LoadedLibraryCatalog) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

/** One read-only connection, one in-flight query, shared by concurrent page consumers. */
export class LibraryCatalogWorkerHost {
  private worker: Worker | null = null
  private pending: Pending | null = null
  private sequence = 0
  private stopping = false
  private idle: ReturnType<typeof setTimeout> | null = null
  private termination: Promise<void> | null = null

  constructor(
    private readonly databasePath: string,
    private readonly options: Options = {},
  ) {}

  load(): Promise<LoadedLibraryCatalog> {
    if (this.stopping) return Promise.reject(new Error('Catalog worker is shutting down'))
    if (this.pending) return this.pending.promise
    if (this.termination) return this.termination.then(() => this.load())
    if (!this.databasePath || this.databasePath === ':memory:')
      return Promise.reject(new Error('Catalog worker requires an initialized file database'))
    if (this.idle) clearTimeout(this.idle)
    this.idle = null
    const worker = this.worker ?? this.createWorker()
    let resolve!: Pending['resolve'], reject!: Pending['reject']
    const promise = new Promise<LoadedLibraryCatalog>((accept, fail) => {
      resolve = accept
      reject = fail
    })
    const id = ++this.sequence
    const timer = setTimeout(() => {
      this.finish(new Error('Library catalog query timed out'))
      void this.stopWorker().catch((error) =>
        logger.warn({ error }, 'Unable to stop catalog worker'),
      )
    }, this.options.timeoutMs ?? 30_000)
    this.pending = { id, promise, resolve, reject, timer }
    try {
      worker.postMessage({ id })
    } catch (error) {
      this.finish(error as Error)
    }
    return promise
  }

  async shutdown(): Promise<void> {
    this.stopping = true
    this.finish(new Error('Application shutdown interrupted catalog query'))
    await this.stopWorker()
  }

  private createWorker(): Worker {
    const worker = new Worker(
      this.options.workerPath ?? join(__dirname, 'features/libraryCatalog/libraryCatalogWorker.js'),
      {
        workerData: { databasePath: this.databasePath },
      },
    )
    this.worker = worker
    worker.on('message', (reply: LibraryCatalogWorkerReply) => {
      if (this.worker !== worker || this.pending?.id !== reply.id) return
      this.finish(
        'error' in reply ? new Error(reply.error) : undefined,
        'catalog' in reply ? reply.catalog : undefined,
      )
    })
    worker.on('error', (error) => {
      if (this.worker === worker) this.finish(error)
    })
    worker.on('exit', (code) => {
      if (this.worker !== worker) return
      this.worker = null
      this.finish(new Error(`Catalog worker exited without a result (code ${code})`))
    })
    return worker
  }

  private finish(error?: Error, catalog?: LoadedLibraryCatalog): void {
    const pending = this.pending
    this.pending = null
    if (pending) {
      clearTimeout(pending.timer)
      if (error) pending.reject(error)
      else pending.resolve(catalog!)
    }
    if (this.idle) clearTimeout(this.idle)
    this.idle = null
    if (!this.stopping && this.worker) {
      this.idle = setTimeout(
        () => {
          this.idle = null
          void this.stopWorker().catch((error) =>
            logger.warn({ error }, 'Unable to stop idle catalog worker'),
          )
        },
        this.options.idleMs ?? 5 * 60_000,
      )
      this.idle.unref()
    }
  }

  private stopWorker(): Promise<void> {
    if (this.idle) clearTimeout(this.idle)
    this.idle = null
    if (this.termination) return this.termination
    const worker = this.worker
    if (!worker) return Promise.resolve()
    const stopping = worker.terminate().then(() => {
      if (this.worker === worker) this.worker = null
    })
    const tracked = stopping.finally(() => {
      if (this.termination === tracked) this.termination = null
    })
    this.termination = tracked
    return tracked
  }
}
