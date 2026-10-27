import { createLibraryScanEvents } from '@main/ipc/libraryScanEvents'
import { getLyricsSidecarFingerprintSync } from '../metadata/resolveLyricsForFile'
import { selectLibraryDirectory } from '@main/app/selectLibraryDirectory'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import type { Worker } from 'node:worker_threads'
import type Database from 'better-sqlite3'
import { dialog } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ArtworkCacheMaintenanceService } from '@main/features/artwork/artworkCacheMaintenanceService'
import type { ArtworkCacheMigrationService } from '@main/features/artwork/artworkCacheMigrationService'
import type { ArtworkCacheGarbageCollector } from '@main/features/artwork/artworkCacheGarbageCollector'
import { migrateDatabase } from '@main/database/schema'
import { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import { TrackRepository } from '@main/repositories/trackRepository'
import type { ScannedTrackFile } from './libraryScanTypes'
import { LibraryScanService } from './libraryScanService'

const workerFiles = vi.hoisted(() => new Set<string>())
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    statSync: (path: string) =>
      workerFiles.has(path)
        ? { size: 10, mtimeMs: 1, ctimeMs: 1, dev: 1, ino: 1, isFile: () => true }
        : actual.statSync(path),
  }
})

vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] },
  dialog: { showOpenDialog: vi.fn() },
  app: { getLocale: () => 'en' },
}))

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
const databases: Database.Database[] = []
class FakeWorker extends EventEmitter {
  terminate = vi.fn(async () => 0)
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve))
function track(filePath: string): ScannedTrackFile {
  workerFiles.add(filePath)
  return {
    filePath,
    fileFingerprint: { size: 10, mtimeMs: 1, ctimeMs: 1, dev: 1, ino: 1 },
    lyricsSidecarFingerprint: getLyricsSidecarFingerprintSync(filePath),
    title: filePath,
    fileSize: 10,
    fileMtimeMs: 1,
    artist: 'Artist',
    album: 'Album',
    albumArtist: 'Artist',
    trackNo: null,
    discNo: null,
    bitrateBps: null,
    durationSeconds: 180,
    year: null,
    releaseDate: null,
    copyright: null,
    composer: null,
    genre: null,
    artworkCacheKey: null,
    lyricsText: null,
    lyricsFormat: null,
    isrc: null,
    metadataSignature: filePath,
  }
}
function harness() {
  const db = new DatabaseCtor(':memory:')
  databases.push(db)
  db.pragma('foreign_keys = ON')
  migrateDatabase(db)
  const root = new LibraryRootRepository(db).upsertByPath('C:\\Music')
  const workers: FakeWorker[] = []
  const send = vi.fn()
  const service = new LibraryScanService(
    db,
    'C:\\Cache',
    selectLibraryDirectory,
    createLibraryScanEvents(send),
    () => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker as unknown as Worker
    },
  )
  vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: false, filePaths: ['C:\\Next'] })
  return { db, service, root, workers, send, repo: new TrackRepository(db) }
}
afterEach(() => {
  workerFiles.clear()
  for (const db of databases.splice(0)) db.close()
  vi.clearAllMocks()
})

describe('scan cancellation and root ownership boundaries', () => {
  it('releases failed preparation even when its failure status cannot be persisted', async () => {
    const h = harness()
    const onEnd = vi.fn()
    h.service.setScanLifecycleHooks({
      onStart: () => Promise.reject(new Error('pause failed')),
      onEnd,
    })
    h.db.exec(
      "CREATE TRIGGER reject_failure BEFORE UPDATE ON scan_jobs WHEN NEW.status='failed' BEGIN SELECT RAISE(ABORT,'failure persistence failed'); END",
    )
    await expect(h.service.startScan(h.root.id)).rejects.toThrow('failure persistence failed')
    expect(h.service.isScanActive()).toBe(false)
    expect(h.workers).toHaveLength(0)
    expect(onEnd).toHaveBeenCalledOnce()
    await h.service.shutdown()
  })

  it('cancels preparation, drains the pause hook, and never starts its worker', async () => {
    const h = harness()
    const pause = deferred()
    const onEnd = vi.fn()
    h.service.setScanLifecycleHooks({ onStart: () => pause.promise, onEnd })
    const start = h.service.startScan(h.root.id)
    const jobId = h.service.getScanStatus()!.jobId
    const canceled = h.service.cancelScan(jobId)
    expect(h.service.isScanActive()).toBe(true)
    expect(onEnd).not.toHaveBeenCalled()
    pause.resolve()
    await expect(start).resolves.toEqual({ jobId })
    await expect(canceled).resolves.toEqual({ ok: true })
    expect(h.workers).toHaveLength(0)
    expect(h.service.getScanStatus(jobId)?.status).toBe('canceled')
    expect(h.service.isScanActive()).toBe(false)
    expect(onEnd).toHaveBeenCalledOnce()
  })

  it('keeps cancellation ownership through termination and resume before importing the next inventory', async () => {
    const h = harness()
    const termination = deferred()
    const resume = deferred()
    let paused = false
    const onEnd = vi.fn(async () => {
      await resume.promise
      paused = false
    })
    h.service.setScanLifecycleHooks({
      onStart: () => {
        paused = true
      },
      onEnd,
    })
    const first = await h.service.startScan(h.root.id)
    h.workers[0].terminate.mockImplementation(async () => {
      await termination.promise
      return 0
    })
    const cancel = h.service.cancelScan(first.jobId)
    expect(h.service.cancelScan(first.jobId)).toBe(cancel)
    const next = h.service.startScan(h.root.id)
    await tick()
    expect(h.workers).toHaveLength(1)
    expect(h.service.getScanStatus(first.jobId)?.status).toBe('scanning')
    termination.resolve()
    await tick()
    expect(h.workers).toHaveLength(1)
    expect(h.service.isScanActive()).toBe(true)
    expect(paused).toBe(true)
    resume.resolve()
    await cancel
    const second = await next
    expect(second.jobId).not.toBe(first.jobId)
    expect(h.workers).toHaveLength(2)
    expect(paused).toBe(true)
    const added = track('C:\\Music\\new.flac')
    h.workers[1].emit('message', { type: 'tracks', payload: [added] })
    h.workers[0].emit('message', { type: 'tracks', payload: [track('C:\\Music\\stale.flac')] })
    h.workers[0].emit('exit', 1)
    await tick()
    expect(paused).toBe(true)
    expect(onEnd).toHaveBeenCalledTimes(1)
    h.workers[1].emit('message', {
      type: 'complete',
      payload: { foundFilePaths: [added.filePath], unreadableDirectoryPaths: [] },
    })
    await tick()
    expect(h.db.prepare('SELECT file_path FROM tracks').pluck().all()).toEqual([added.filePath])
    expect(h.service.getScanStatus(second.jobId)?.status).toBe('completed')
    expect(onEnd).toHaveBeenCalledTimes(2)
    expect(h.service.isScanActive()).toBe(false)
  })

  it.each(['complete', 'fatal', 'error'] as const)(
    'waits for async terminal cleanup after %s before the next scan',
    async (ending) => {
      const h = harness()
      const resume = deferred()
      h.service.setScanLifecycleHooks({ onEnd: () => resume.promise })
      await h.service.startScan(h.root.id)
      if (ending === 'error') h.workers[0].emit('error', new Error('failed'))
      else
        h.workers[0].emit(
          'message',
          ending === 'fatal'
            ? { type: 'fatal', payload: { jobId: 1, reason: 'failed' } }
            : { type: 'complete', payload: { foundFilePaths: [], unreadableDirectoryPaths: [] } },
        )
      const next = h.service.startScan(h.root.id)
      await tick()
      expect(h.workers).toHaveLength(1)
      expect(h.service.isScanActive()).toBe(true)
      resume.resolve()
      await next
      expect(h.workers).toHaveLength(2)
      await h.service.shutdown()
    },
  )

  it('retains the worker and paused lifecycle after failed termination, then safely retries', async () => {
    const h = harness()
    const gate = deferred()
    const onEnd = vi.fn()
    h.service.setScanLifecycleHooks({ onEnd })
    const first = await h.service.startScan(h.root.id)
    h.workers[0].terminate.mockImplementationOnce(async () => {
      await gate.promise
      throw new Error('termination failed')
    })
    const cancel = h.service.cancelScan(first.jobId)
    const failedCancel = expect(cancel).rejects.toThrow('termination failed')
    const failedStart = expect(h.service.startScan(h.root.id)).rejects.toThrow('termination failed')
    gate.resolve()
    await Promise.all([failedCancel, failedStart])
    expect(h.workers).toHaveLength(1)
    expect(h.service.isScanActive()).toBe(true)
    expect(onEnd).not.toHaveBeenCalled()
    expect(h.service.getScanStatus(first.jobId)?.status).toBe('scanning')
    await h.service.cancelScan(first.jobId)
    expect(onEnd).toHaveBeenCalledOnce()
    await h.service.startScan(h.root.id)
    expect(h.workers).toHaveLength(2)
    await h.service.shutdown()
  })

  it('replays inventory and completion buffered during a failed termination', async () => {
    const h = harness()
    const gate = deferred()
    const first = await h.service.startScan(h.root.id)
    h.workers[0].terminate.mockImplementationOnce(async () => {
      await gate.promise
      throw new Error('termination failed')
    })
    const cancel = expect(h.service.cancelScan(first.jobId)).rejects.toThrow('termination failed')
    const added = track('C:\\Music\\during-cancel.flac')
    h.workers[0].emit('message', { type: 'tracks', payload: [added] })
    h.workers[0].emit('message', {
      type: 'complete',
      payload: { foundFilePaths: [added.filePath], unreadableDirectoryPaths: [] },
    })
    expect(h.db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(0)
    gate.resolve()
    await cancel
    expect(h.db.prepare('SELECT file_path FROM tracks').pluck().all()).toEqual([added.filePath])
    expect(h.service.getScanStatus(first.jobId)?.status).toBe('completed')
    expect(h.service.isScanActive()).toBe(false)
  })

  it('releases a terminated worker and resumes writers even if persisting cancellation fails', async () => {
    const h = harness()
    const onEnd = vi.fn()
    h.service.setScanLifecycleHooks({ onEnd })
    const first = await h.service.startScan(h.root.id)
    h.db.exec(
      "CREATE TRIGGER reject_cancel BEFORE UPDATE ON scan_jobs WHEN NEW.status='canceled' BEGIN SELECT RAISE(ABORT,'cancel persistence failed'); END",
    )
    await expect(h.service.cancelScan(first.jobId)).rejects.toThrow('cancel persistence failed')
    expect(h.service.isScanActive()).toBe(false)
    expect(onEnd).toHaveBeenCalledOnce()
    expect(h.workers[0].terminate).toHaveBeenCalledOnce()
    expect(h.service.getScanStatus(first.jobId)?.status).toBe('scanning')
    const second = await h.service.startScan(h.root.id)
    expect(second.jobId).not.toBe(first.jobId)
    expect(h.service.getScanStatus(first.jobId)?.status).toBe('failed')
    expect(h.workers).toHaveLength(2)
    h.db.exec('DROP TRIGGER reject_cancel')
    await h.service.shutdown()
  })

  it('runs after-scan maintenance with the real writer gate after synchronous lifecycle cleanup', async () => {
    const h = harness()
    const collectGarbage = vi.fn(async (canContinue: () => boolean) => {
      expect(canContinue()).toBe(true)
    })
    const maintenance = new ArtworkCacheMaintenanceService(
      {} as ArtworkCacheMigrationService,
      { collectGarbage } as unknown as ArtworkCacheGarbageCollector,
      {
        isScanActive: () => h.service.isScanActive(),
        isRefreshActive: () => false,
        isImportActive: () => false,
      },
    )
    h.service.setScanLifecycleHooks({
      onEnd: () => {
        queueMicrotask(() => {
          void maintenance.runAfterScanGarbageCollection()
        })
      },
    })
    await h.service.startScan(h.root.id)
    await maintenance.runAfterScanGarbageCollection()
    expect(collectGarbage).not.toHaveBeenCalled()
    h.workers[0].emit('message', {
      type: 'complete',
      payload: { foundFilePaths: [], unreadableDirectoryPaths: [] },
    })
    await tick()
    expect(collectGarbage).toHaveBeenCalledOnce()
    await maintenance.shutdown()
  })

  it('waits for terminal resume during shutdown', async () => {
    const h = harness()
    const resume = deferred()
    h.service.setScanLifecycleHooks({ onEnd: () => resume.promise })
    await h.service.startScan(h.root.id)
    h.workers[0].emit('message', {
      type: 'complete',
      payload: { foundFilePaths: [], unreadableDirectoryPaths: [] },
    })
    const done = vi.fn()
    const shutdown = h.service.shutdown().then(done)
    await tick()
    expect(done).not.toHaveBeenCalled()
    resume.resolve()
    await shutdown
    expect(h.service.isScanActive()).toBe(false)
  })

  it.each(['preparing', 'running', 'canceling'] as const)(
    'rechecks %s scan ownership when the directory dialog returns',
    async (phase) => {
      const h = harness()
      const dialogGate = deferred()
      vi.mocked(dialog.showOpenDialog).mockImplementation(async () => {
        await dialogGate.promise
        return { canceled: false, filePaths: ['C:\\Next'] }
      })
      const change = h.service.selectRoot()
      const preparation = deferred()
      if (phase === 'preparing')
        h.service.setScanLifecycleHooks({ onStart: () => preparation.promise })
      const start = h.service.startScan(h.root.id)
      const jobId = h.service.getScanStatus()!.jobId
      const termination = deferred()
      let cancel: Promise<{ ok: boolean }> | undefined
      if (phase !== 'preparing') await start
      if (phase === 'canceling') {
        h.workers[0].terminate.mockImplementation(async () => {
          await termination.promise
          return 0
        })
        cancel = h.service.cancelScan(jobId)
      }
      const rejectedChange = expect(change).rejects.toThrow('Cannot change library root')
      dialogGate.resolve()
      await rejectedChange
      expect(h.service.getRoots()).toEqual([h.root])
      expect(h.service.getScanStatus(jobId)).not.toBeNull()
      expect(h.send).not.toHaveBeenCalledWith('library:changed', expect.anything())
      preparation.resolve()
      termination.resolve()
      await start
      if (cancel) await cancel
      await h.service.shutdown()
    },
  )

  it('drains root writers before commit, blocks scans, and publishes only newly excluded IDs after commit', async () => {
    const h = harness()
    h.repo.upsertMany([
      track('C:\\Music\\gone.flac'),
      track('C:\\Music\\already-missing.flac'),
      track('C:\\Elsewhere\\keep.flac'),
    ])
    h.repo.markMissingByFilePaths(['C:\\Music\\already-missing.flac'])
    const id = h.repo.getTrackIdsByFilePaths(['C:\\Music\\gone.flac'])[0]
    const drain = deferred()
    const onEnd = vi.fn(() => {
      expect(h.service.getRoots()[0].path).toBe('C:\\Next')
    })
    h.service.setRootChangeHooks({ onStart: () => drain.promise, onEnd })
    const change = h.service.selectRoot()
    await tick()
    expect(h.service.getRoots()).toEqual([h.root])
    expect(h.send).not.toHaveBeenCalled()
    await expect(h.service.startScan(h.root.id)).rejects.toThrow('root is changing')
    drain.resolve()
    await change
    expect(h.send).toHaveBeenCalledExactlyOnceWith('library:changed', {
      reason: 'track-missing',
      trackIds: [id],
      filePaths: [],
    })
    expect(
      h.db
        .prepare("SELECT availability FROM tracks WHERE file_path='C:\\Elsewhere\\keep.flac'")
        .pluck()
        .get(),
    ).toBe('available')
    expect(onEnd).toHaveBeenCalledOnce()
  })

  it('rolls back root and track changes and sends no missing event when root insertion fails', async () => {
    const h = harness()
    h.repo.upsertMany([track('C:\\Music\\song.flac')])
    const before = h.db.prepare('SELECT * FROM tracks').all()
    h.db.exec(
      "CREATE TRIGGER reject_new_root BEFORE INSERT ON library_roots BEGIN SELECT RAISE(ABORT,'root rejected'); END",
    )
    const onEnd = vi.fn()
    h.service.setRootChangeHooks({ onEnd })
    await expect(h.service.selectRoot()).rejects.toThrow('root rejected')
    expect(h.service.getRoots()).toEqual([h.root])
    expect(h.db.prepare('SELECT * FROM tracks').all()).toEqual(before)
    expect(h.send).not.toHaveBeenCalled()
    expect(onEnd).toHaveBeenCalledOnce()
    await h.service.startScan(h.root.id)
    await h.service.shutdown()
  })

  it.each(['canceled', 'same', 'narrower', 'broader'] as const)(
    'preserves expected directory selection semantics for %s',
    async (mode) => {
      const h = harness()
      h.repo.upsertMany([track('C:\\Music\\outside.flac'), track('C:\\Music\\Disc\\inside.flac')])
      const nextPath =
        mode === 'same' ? 'c:\\music\\' : mode === 'narrower' ? 'C:\\Music\\Disc' : 'C:\\'
      vi.mocked(dialog.showOpenDialog).mockResolvedValue({
        canceled: mode === 'canceled',
        filePaths: [nextPath],
      })
      const onStart = vi.fn()
      const onEnd = vi.fn()
      h.service.setRootChangeHooks({ onStart, onEnd })
      await h.service.selectRoot()
      const available = h.db
        .prepare("SELECT file_path FROM tracks WHERE availability='available' ORDER BY file_path")
        .pluck()
        .all()
      expect(available).toEqual(
        mode === 'narrower'
          ? ['C:\\Music\\Disc\\inside.flac']
          : ['C:\\Music\\Disc\\inside.flac', 'C:\\Music\\outside.flac'],
      )
      if (mode === 'same' || mode === 'canceled') {
        expect(h.service.getRoots()).toEqual([h.root])
        expect(onStart).not.toHaveBeenCalled()
        expect(onEnd).not.toHaveBeenCalled()
        expect(h.send).not.toHaveBeenCalled()
      }
    },
  )
})
