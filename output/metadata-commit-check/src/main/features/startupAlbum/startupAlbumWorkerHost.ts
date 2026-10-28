import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import type { StartupAlbumHistory } from '@shared/types/startupAlbum'
import type { RandomAlbumTracksResult } from '@shared/types/playback'
import type { StartupAlbumWorkerInput, StartupAlbumWorkerMessage } from './startupAlbumWorkerTypes'

interface StartupAlbumWorkerHostOptions {
  workerPath?: string
  timeoutMs?: number
}

interface ActiveQuery {
  finish(error: Error): void
  stop(): Promise<void>
}

/** A short-lived read worker; no library rows are copied through the main process. */
export class StartupAlbumWorkerHost {
  private active: ActiveQuery | null = null
  private stopping = false

  constructor(
    private readonly databasePath: string,
    private readonly options: StartupAlbumWorkerHostOptions = {},
  ) {}

  getStartupAlbumTracks(
    history: StartupAlbumHistory = [],
  ): Promise<RandomAlbumTracksResult | null> {
    if (this.stopping) return Promise.reject(new Error('Startup album worker is shutting down'))
    if (this.active) return Promise.reject(new Error('Startup album query is already running'))
    // In-memory databases belong to one connection. Do not silently query a new empty database
    // or fall back to blocking the main thread.
    if (!this.databasePath || this.databasePath === ':memory:') {
      return Promise.reject(new Error('Startup album worker requires an initialized file database'))
    }

    return new Promise((resolve, reject) => {
      const input: StartupAlbumWorkerInput = { databasePath: this.databasePath, history }
      const worker = new Worker(
        this.options.workerPath ?? join(__dirname, 'features/startupAlbum/startupAlbumWorker.js'),
        { workerData: input },
      )
      let settled = false
      let exited = false
      let stopping: Promise<void> | undefined
      const stop = (): Promise<void> => {
        if (exited) return Promise.resolve()
        if (!stopping) {
          stopping = worker.terminate().then(
            () => {
              exited = true
            },
            (error: unknown) => {
              stopping = undefined
              throw error
            },
          )
        }
        return stopping
      }
      const finish = (error?: Error, album: RandomAlbumTracksResult | null = null): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        // Wait for the worker's connection to be gone before allowing database shutdown.
        void stop().then(() => {
          if (this.active === query) this.active = null
          if (error) reject(error)
          else resolve(album)
        }, reject)
      }
      const query: ActiveQuery = { finish, stop }
      this.active = query
      const timer = setTimeout(
        () => finish(new Error('Startup album query timed out')),
        this.options.timeoutMs ?? 5_000,
      )
      worker.on('message', (message: StartupAlbumWorkerMessage) => {
        if (message.type === 'result') finish(undefined, message.album)
        else finish(new Error(message.reason))
      })
      worker.on('error', (error) => finish(error))
      worker.on('exit', (code) => {
        exited = true
        finish(new Error(`Startup album worker exited without a result (code ${code})`))
      })
    })
  }

  async shutdown(): Promise<void> {
    this.stopping = true
    const query = this.active
    if (!query) return
    query.finish(new Error('Application shutdown interrupted startup album query'))
    await query.stop()
    if (this.active === query) this.active = null
  }
}
