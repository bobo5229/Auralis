import { EventEmitter } from 'node:events'
import type { Worker } from 'node:worker_threads'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type Database from 'better-sqlite3'
import { expect, it, vi } from 'vitest'
import { migrateDatabase } from '@main/database/schema'
import { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import { DatabaseWriteAdmission } from '@main/database/databaseWriteAdmission'
import { LibraryScanService } from './libraryScanService'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
it('queues actual scan start, Host progress, cancellation and root replacement behind a real WAL writer', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'auralis-scan-admission-'))
  const path = join(directory, 'library.sqlite')
  const rootPath = join(directory, 'root'),
    nextPath = join(directory, 'next')
  mkdirSync(rootPath)
  mkdirSync(nextPath)
  const db = new DatabaseCtor(path)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 0')
  migrateDatabase(db)
  const root = new LibraryRootRepository(db).upsertByPath(rootPath)
  const writer = new DatabaseCtor(path)
  const admission = new DatabaseWriteAdmission()
  const progress = vi.fn(),
    onEnd = vi.fn()
  const reader = new EventEmitter() as EventEmitter & { terminate: ReturnType<typeof vi.fn> }
  reader.terminate = vi.fn(async () => 0)
  const service = new LibraryScanService(
    db,
    directory,
    async () => nextPath,
    { progress, changed: vi.fn() },
    () => reader as unknown as Worker,
    admission,
  )
  service.setScanLifecycleHooks({ onEnd })
  let unlock: (() => void) | undefined
  const lock = async () => {
    const lease = await admission.acquireExclusive()
    writer.exec('BEGIN IMMEDIATE')
    unlock = () => {
      if (writer.inTransaction) writer.exec('ROLLBACK')
      lease.release()
    }
    return unlock
  }
  try {
    let release = await lock()
    const starting = service.startScan(root.id)
    await delay(20)
    expect(db.prepare('SELECT COUNT(*) FROM scan_jobs').pluck().get()).toBe(0)
    release()
    const { jobId } = await starting
    release = await lock()
    reader.emit('message', {
      type: 'progress',
      payload: {
        jobId,
        status: 'scanning',
        totalFiles: 2,
        scannedFiles: 1,
        failedFiles: 0,
        currentFile: null,
        message: null,
      },
    })
    await delay(20)
    expect(service.getScanStatus(jobId)?.scannedFiles).toBe(0)
    expect(progress).not.toHaveBeenCalled()
    release()
    await vi.waitFor(() => expect(service.getScanStatus(jobId)?.scannedFiles).toBe(1))
    release = await lock()
    const cancel = service.cancelScan(jobId)
    await delay(20)
    expect(service.getScanStatus(jobId)?.status).toBe('scanning')
    expect(onEnd).not.toHaveBeenCalled()
    release()
    await expect(cancel).resolves.toEqual({ ok: true })
    expect(service.getScanStatus(jobId)?.status).toBe('canceled')
    expect(onEnd).toHaveBeenCalledOnce()
    release = await lock()
    const replacing = service.selectRoot()
    await delay(20)
    expect(service.getRoots()[0].path).toBe(rootPath)
    release()
    await expect(replacing).resolves.toMatchObject({ canceled: false, root: { path: nextPath } })
  } finally {
    unlock?.()
    await service.shutdown()
    writer.close()
    db.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
