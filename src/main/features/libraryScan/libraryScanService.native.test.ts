import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import type { Worker, WorkerOptions } from 'node:worker_threads'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateDatabase } from '@main/database/schema'
import { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import type { LibraryScanWorkerMessage } from './libraryScanTypes'
import { LibraryScanService, type LibraryScanWorkerFactory } from './libraryScanService'

const nodeRequire = createRequire(import.meta.url)
const DatabaseCtor = nodeRequire('better-sqlite3') as unknown as new (
  path: string,
) => Database.Database

class FakeWorker extends EventEmitter {
  readonly terminate = vi.fn(async () => 0)
}

const databases: Database.Database[] = []

function createHarness(): {
  db: Database.Database
  service: LibraryScanService
  worker: FakeWorker
  rootId: number
  workerOptions: () => WorkerOptions | null
} {
  const db = new DatabaseCtor(':memory:')
  databases.push(db)
  migrateDatabase(db)
  const root = new LibraryRootRepository(db).upsertByPath('C:\\Music')
  const worker = new FakeWorker()
  let capturedOptions: WorkerOptions | null = null
  const createWorker: LibraryScanWorkerFactory = (_fileName, options) => {
    capturedOptions = options
    return worker as unknown as Worker
  }
  const service = new LibraryScanService(db, 'C:\\Cache', createWorker, () => [])

  return {
    db,
    service,
    worker,
    rootId: root.id,
    workerOptions: () => capturedOptions,
  }
}

function emitWorkerMessage(worker: FakeWorker, message: LibraryScanWorkerMessage): void {
  worker.emit('message', message)
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})

describe('LibraryScanService worker lifecycle', () => {
  it('starts one worker and persists progress through completion', async () => {
    const { db, service, worker, rootId, workerOptions } = createHarness()
    const onStart = vi.fn()
    const onEnd = vi.fn()
    service.setScanLifecycleHooks({ onStart, onEnd })

    const { jobId } = await service.startScan(rootId)
    const duplicate = await service.startScan(rootId)

    expect(duplicate).toEqual({ jobId })
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(workerOptions()?.workerData).toMatchObject({
      jobId,
      rootPath: 'C:\\Music',
      artworkCacheDir: 'C:\\Cache',
    })

    emitWorkerMessage(worker, {
      type: 'progress',
      payload: {
        jobId,
        status: 'scanning',
        totalFiles: 10,
        scannedFiles: 4,
        failedFiles: 1,
        currentFile: 'C:\\Music\\track.flac',
        message: 'Scanning',
      },
    })
    expect(service.getScanStatus(jobId)).toMatchObject({
      status: 'scanning',
      totalFiles: 10,
      scannedFiles: 4,
      failedFiles: 1,
    })

    emitWorkerMessage(worker, {
      type: 'complete',
      payload: { foundFilePaths: [], unreadableDirectoryPaths: [] },
    })
    await vi.waitFor(() => expect(onEnd).toHaveBeenCalledTimes(1))

    expect(service.isScanActive()).toBe(false)
    expect(service.getScanStatus(jobId)?.status).toBe('completed')
    expect(
      db.prepare('SELECT last_scanned_at FROM library_roots WHERE id = ?').pluck().get(rootId),
    ).not.toBeNull()
  })

  it('cancels before a late worker exit can overwrite the terminal state', async () => {
    const { service, worker, rootId } = createHarness()
    const onEnd = vi.fn()
    service.setScanLifecycleHooks({ onEnd })
    const { jobId } = await service.startScan(rootId)

    await expect(service.cancelScan(jobId)).resolves.toEqual({ ok: true })
    worker.emit('exit', 1)
    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(worker.terminate).toHaveBeenCalledTimes(1)
    expect(service.getScanStatus(jobId)?.status).toBe('canceled')
    expect(service.isScanActive()).toBe(false)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('settles worker errors once and releases the lifecycle', async () => {
    const { service, worker, rootId } = createHarness()
    const onEnd = vi.fn()
    service.setScanLifecycleHooks({ onEnd })
    const { jobId } = await service.startScan(rootId)

    worker.emit('error', new Error('worker failed'))
    worker.emit('exit', 1)
    await vi.waitFor(() => expect(onEnd).toHaveBeenCalledTimes(1))

    expect(service.getScanStatus(jobId)).toMatchObject({
      status: 'failed',
      errorMessage: 'worker failed',
    })
    expect(service.isScanActive()).toBe(false)
  })

  it('marks the job failed when lifecycle preparation rejects', async () => {
    const { service, rootId, workerOptions } = createHarness()
    const onEnd = vi.fn()
    service.setScanLifecycleHooks({
      onStart: () => Promise.reject(new Error('watch pause failed')),
      onEnd,
    })

    await expect(service.startScan(rootId)).rejects.toThrow('watch pause failed')

    expect(workerOptions()).toBeNull()
    expect(service.getScanStatus()).toMatchObject({
      status: 'failed',
      errorMessage: 'watch pause failed',
    })
    expect(service.isScanActive()).toBe(false)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
})
