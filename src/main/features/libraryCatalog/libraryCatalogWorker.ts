import { parentPort, workerData } from 'node:worker_threads'
import Database from 'better-sqlite3'
import { TrackQueryRepository } from '@main/repositories/trackQueryRepository'
import type { LibraryCatalogWorkerReply } from './libraryCatalogWorkerTypes'

const db = new Database((workerData as { databasePath: string }).databasePath, {
  readonly: true,
  fileMustExist: true,
  timeout: 250,
})
db.pragma('query_only = ON')
const repository = new TrackQueryRepository(db)
// Read revision and rows in one snapshot; do not keep a read transaction open during sorting.
const read = db.transaction(() => ({
  revision: repository.getChangeToken(),
  tracks: repository.getAllUnsorted(),
}))
parentPort?.on('message', ({ id }: { id: number }) => {
  let reply: LibraryCatalogWorkerReply
  try {
    const catalog = read()
    catalog.tracks = repository.orderCatalog(catalog.tracks)
    reply = { id, catalog }
  } catch (error) {
    reply = { id, error: error instanceof Error ? error.message : 'Unable to load library catalog' }
  }
  parentPort?.postMessage(reply)
})
parentPort?.once('close', () => db.close())
