import Database from 'better-sqlite3'
import { parentPort, workerData } from 'node:worker_threads'
import { queryStartupAlbum } from './startupAlbumQuery'
import type { StartupAlbumWorkerInput, StartupAlbumWorkerMessage } from './startupAlbumWorkerTypes'

const input = workerData as StartupAlbumWorkerInput
let message: StartupAlbumWorkerMessage
let db: Database.Database | undefined
try {
  // The main process has already initialized and migrated this database.
  // Never create, migrate, or write a database from this worker.
  db = new Database(input.databasePath, { readonly: true, fileMustExist: true })
  db.pragma('query_only = ON')
  message = { type: 'result', album: queryStartupAlbum(db, input.history) }
} catch (error) {
  message = {
    type: 'error',
    reason: error instanceof Error ? error.message : 'Startup album query failed',
  }
} finally {
  db?.close()
}
parentPort?.postMessage(message)
parentPort?.close()
