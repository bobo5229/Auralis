import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import type { Worker, WorkerOptions } from 'node:worker_threads'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import type { BrowserWindow } from 'electron'
import { migrateDatabase } from '@main/database/schema'
import { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import { TrackRepository } from '@main/repositories/trackRepository'
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
  send: ReturnType<typeof vi.fn>
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
  const send = vi.fn()
  const service = new LibraryScanService(db, 'C:\\Cache', createWorker, () => [
    { webContents: { isDestroyed: () => false, send } } as unknown as BrowserWindow,
  ])

  return {
    db,
    service,
    worker,
    rootId: root.id,
    workerOptions: () => capturedOptions,
    send,
  }
}

function emitWorkerMessage(worker: FakeWorker, message: LibraryScanWorkerMessage): void {
  worker.emit('message', message)
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})

describe('LibraryScanService worker lifecycle', () => {
  it('preserves stored metadata after a failed read and commits a later retry with its sidecar fingerprint', async () => {
    const { db, service, worker, rootId } = createHarness()
    const repo = new TrackRepository(db)
    const track = {
      filePath: 'C:\\Music\\song.flac',
      fileSize: 100,
      fileMtimeMs: 100,
      title: 'Original',
      artist: 'Artist',
      album: 'Album',
      albumArtist: 'Artist',
      trackNo: 1,
      discNo: 1,
      durationSeconds: 180,
      year: null,
      releaseDate: null,
      copyright: null,
      composer: null,
      genre: null,
      artworkCacheKey: null,
      lyricsText: 'original lyrics',
      lyricsFormat: 'plain' as const,
      lyricsSidecarFingerprint: '[null,null]',
      isrc: null,
      metadataSignature: 'original',
    }
    repo.upsertMany([track])
    const { jobId } = await service.startScan(rootId)
    emitWorkerMessage(worker, {
      type: 'failure',
      payload: { jobId, filePath: track.filePath, reason: 'EBUSY' },
    })
    emitWorkerMessage(worker, {
      type: 'complete',
      payload: {
        foundFilePaths: [track.filePath],
        unreadableDirectoryPaths: [],
      },
    })
    expect(repo.getAll()[0]).toMatchObject({ title: 'Original', durationSeconds: 180 })
    expect(repo.getKnownFiles()[0]).toMatchObject({
      fileSize: 100,
      fileMtimeMs: 100,
      metadataCheckedMtimeMs: 100,
    })
    expect(repo.getLyricsByTrackId(1)?.lyricsText).toBe('original lyrics')

    await service.startScan(rootId)
    emitWorkerMessage(worker, {
      type: 'tracks',
      payload: [
        {
          ...track,
          title: 'Updated',
          fileSize: 200,
          fileMtimeMs: 200,
          lyricsSidecarFingerprint: '[[20,200],null]',
        },
      ],
    })
    expect(repo.getAll()).toHaveLength(1)
    expect(repo.getAll()[0]).toMatchObject({ id: 1, title: 'Updated' })
    expect(repo.getKnownFiles()[0]).toMatchObject({
      fileMtimeMs: 200,
      metadataCheckedMtimeMs: 200,
      lyricsSidecarFingerprint: '[[20,200],null]',
    })
    await service.cancelScan(2)
  })

  it('persists a sidecar deletion and clears lyrics in both storage layers', async () => {
    const { db, service, worker, rootId, send } = createHarness()
    db.prepare(
      `INSERT INTO tracks (id, file_path, lyrics_text, lyrics_format, file_mtime_ms)
      VALUES (1, ?, 'old sidecar', 'lrc', 100)`,
    ).run('C:\\Music\\song.flac')
    db.exec(`INSERT INTO track_metadata (track_id, lyrics_text, lyrics_format, source)
      VALUES (1, 'old sidecar', 'lrc', 'user_edit')`)
    await service.startScan(rootId)
    emitWorkerMessage(worker, {
      type: 'trackLyrics',
      payload: [
        {
          filePath: 'C:\\Music\\song.flac',
          lyricsText: null,
          lyricsFormat: null,
          lyricsCheckedMtimeMs: 100,
          lyricsSidecarFingerprint: '[null,null]',
        },
      ],
    })
    const repo = new TrackRepository(db)
    expect(repo.getKnownFiles()[0]).toMatchObject({
      lyricsCheckedMtimeMs: 100,
      lyricsSidecarFingerprint: '[null,null]',
    })
    expect(repo.getLyricsByTrackId(1)?.lyricsText).toBeNull()
    expect(
      db.prepare('SELECT lyrics_text FROM track_metadata WHERE track_id = 1').pluck().get(),
    ).toBeNull()
    expect(db.prepare('SELECT source FROM track_metadata WHERE track_id = 1').pluck().get()).toBe(
      'user_edit',
    )
    expect(send).toHaveBeenCalledWith('library:changed', {
      reason: 'metadata-refresh',
      trackIds: [1],
      filePaths: ['C:\\Music\\song.flac'],
    })
    await service.cancelScan(1)
  })
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
