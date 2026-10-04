import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
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
const roots: string[] = []

function createHarness(rootPath = 'C:\\Music'): {
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
  const root = new LibraryRootRepository(db).upsertByPath(rootPath)
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

afterEach(async () => {
  for (const db of databases.splice(0)) if (db.open) db.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

describe('LibraryScanService worker lifecycle', () => {
  it.each(['clean', 'read-failure', 'unreadable-directory', 'moved', 'rollback'] as const)(
    'only removes confirmed deletion after a complete healthy scan: %s',
    async (scenario) => {
      const root = await mkdtemp(join(tmpdir(), 'auralis-scan-cleanup-'))
      roots.push(root)
      const { db, service, worker, rootId, send } = createHarness(root)
      const path = join(root, 'gone.flac')
      const track = {
        filePath: path,
        fileSize: 100,
        fileMtimeMs: 1,
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        albumArtist: 'Artist',
        trackNo: null,
        discNo: null,
        durationSeconds: 180,
        year: null,
        releaseDate: null,
        copyright: null,
        composer: null,
        genre: 'Pop',
        artworkCacheKey: null,
        lyricsText: null,
        lyricsFormat: null,
        isrc: null,
        metadataSignature: 'test',
      }
      new TrackRepository(db).upsertMany([track])
      const id = db.prepare('SELECT id FROM tracks').pluck().get() as number
      db.prepare('INSERT INTO track_play_stats(track_id,play_count) VALUES(?,3)').run(id)
      const { jobId } = await service.startScan(rootId)
      if (scenario === 'read-failure')
        emitWorkerMessage(worker, {
          type: 'failure',
          payload: {
            jobId,
            filePath: join(root, 'unknown.flac'),
            reason: 'Unable to parse metadata',
          },
        })
      if (scenario === 'moved')
        emitWorkerMessage(worker, {
          type: 'tracks',
          payload: [{ ...track, filePath: join(root, 'moved.flac') }],
        })
      if (scenario === 'rollback')
        db.exec(
          "CREATE TRIGGER fail_removal_completion BEFORE UPDATE ON scan_jobs WHEN NEW.status='completed' BEGIN SELECT RAISE(ABORT,'injected cleanup commit failure'); END",
        )
      emitWorkerMessage(worker, {
        type: 'complete',
        payload: {
          foundFilePaths: scenario === 'moved' ? [join(root, 'moved.flac')] : [],
          unreadableDirectoryPaths:
            scenario === 'unreadable-directory' ? [join(root, 'blocked')] : [],
        },
      })
      expect(db.prepare('SELECT COUNT(*) FROM removed_track_history').pluck().get()).toBe(
        scenario === 'clean' ? 1 : 0,
      )
      expect(db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(
        scenario === 'clean' ? 0 : 1,
      )
      if (scenario === 'clean')
        expect(send).toHaveBeenCalledWith(
          'library:changed',
          expect.objectContaining({ reason: 'track-missing', trackIds: [id] }),
        )
      if (scenario === 'moved')
        expect(db.prepare('SELECT file_path FROM tracks WHERE id=?').pluck().get(id)).toBe(
          join(root, 'moved.flac'),
        )
      if (scenario === 'rollback') {
        expect(db.prepare('SELECT file_path,availability FROM tracks WHERE id=?').get(id)).toEqual({
          file_path: path,
          availability: 'available',
        })
        expect(send).not.toHaveBeenCalledWith('library:changed', expect.anything())
      }
    },
  )

  it.each([
    {
      label: 'whole-album ISRC collision',
      oldDuration: 4882.104354166667,
      newDuration: 106.86316666666667,
      relocate: false,
    },
    {
      label: 'same-track ISRC across codecs',
      oldDuration: 180,
      newDuration: 180.067,
      relocate: true,
    },
  ])(
    'preserves record identity and history for $label',
    async ({ oldDuration, newDuration, relocate }) => {
      const { db, service, worker, rootId, send } = createHarness()
      const oldPath = 'C:\\Music\\old.m4a'
      const newPath = 'C:\\Music\\renamed.flac'
      db.prepare(
        `INSERT INTO tracks (id,file_path,title,artist,album,duration_seconds,file_size,isrc,availability)
      VALUES (1,?,'Original','Artist','Album',?,1000,'MATCH','available')`,
      ).run(oldPath, oldDuration)
      db.prepare('INSERT INTO track_play_stats(track_id,play_count) VALUES(1,5)').run()
      db.prepare(
        "INSERT INTO daily_track_play_stats(play_date,track_id,play_count,duration_seconds) VALUES('2026-10-03',1,5,900)",
      ).run()
      db.prepare(
        "INSERT INTO daily_play_stats(play_date,play_count,duration_seconds) VALUES('2026-10-03',5,900)",
      ).run()
      db.prepare("INSERT INTO playlists(id,name) VALUES(1,'Favorites')").run()
      db.prepare('INSERT INTO playlist_tracks(playlist_id,track_id,position) VALUES(1,1,0)').run()
      db.prepare(
        "INSERT INTO track_metadata(track_id,title,source) VALUES(1,'Edited title','user_edit')",
      ).run()
      const preservedTables = [
        'track_play_stats',
        'daily_track_play_stats',
        'daily_play_stats',
        'playlist_tracks',
        'track_metadata',
      ]
      const before = preservedTables.map((table) => db.prepare(`SELECT * FROM ${table}`).all())
      await service.startScan(rootId)
      emitWorkerMessage(worker, {
        type: 'tracks',
        payload: [
          {
            filePath: newPath,
            fileSize: 100_000,
            fileMtimeMs: 100,
            title: 'New title',
            artist: 'Artist',
            album: 'Album',
            albumArtist: 'Artist',
            trackNo: 1,
            discNo: 1,
            durationSeconds: newDuration,
            year: null,
            releaseDate: null,
            copyright: null,
            composer: null,
            genre: null,
            artworkCacheKey: null,
            lyricsText: null,
            lyricsFormat: null,
            lyricsSidecarFingerprint: '[null,null]',
            isrc: 'MATCH',
            metadataSignature: 'new-signature',
          },
        ],
      })
      emitWorkerMessage(worker, {
        type: 'complete',
        payload: { foundFilePaths: [newPath], unreadableDirectoryPaths: [] },
      })
      await vi.waitFor(() => expect(service.isScanActive()).toBe(false))
      expect(
        db.prepare('SELECT play_count FROM track_play_stats WHERE track_id=1').pluck().get(),
      ).toBe(5)
      expect(preservedTables.map((table) => db.prepare(`SELECT * FROM ${table}`).all())).toEqual(
        before,
      )
      const original = db
        .prepare('SELECT file_path,title,duration_seconds,availability FROM tracks WHERE id=1')
        .get()
      if (relocate) {
        expect(original).toMatchObject({
          file_path: newPath,
          title: 'New title',
          duration_seconds: newDuration,
          availability: 'available',
        })
        expect(db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(1)
        expect(send).toHaveBeenCalledWith(
          'library:changed',
          expect.objectContaining({ reason: 'track-relocated', trackIds: [1] }),
        )
        expect(send).not.toHaveBeenCalledWith(
          'library:changed',
          expect.objectContaining({ reason: 'track-missing', trackIds: [1] }),
        )
      } else {
        expect(original).toMatchObject({
          file_path: oldPath,
          title: 'Original',
          duration_seconds: oldDuration,
          availability: 'missing',
        })
        expect(db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(2)
        expect(
          db.prepare('SELECT availability FROM tracks WHERE file_path=?').pluck().get(newPath),
        ).toBe('available')
        expect(send).not.toHaveBeenCalledWith(
          'library:changed',
          expect.objectContaining({ reason: 'track-relocated' }),
        )
      }
    },
  )

  it.each(['complete', 'fatal', 'cancel'] as const)(
    'handles new-path inventory on %s without premature identity changes',
    async (ending) => {
      const { db, service, worker, rootId, send } = createHarness()
      db.prepare(
        "INSERT INTO tracks(id,file_path,title,artist,album,duration_seconds,file_size,availability) VALUES(1,'C:\\Music\\old.flac','Song','Artist','Album',180,100,'available')",
      ).run()
      const track = {
        filePath: 'C:\\Music\\new.flac',
        fileSize: 100,
        fileMtimeMs: 1,
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        albumArtist: 'Artist',
        trackNo: null,
        discNo: null,
        durationSeconds: 180,
        year: null,
        releaseDate: null,
        copyright: null,
        composer: null,
        genre: 'Pop',
        artworkCacheKey: null,
        lyricsText: null,
        lyricsFormat: null,
        isrc: null,
        metadataSignature: 'test-signature',
      }
      const { jobId } = await service.startScan(rootId)
      emitWorkerMessage(worker, { type: 'tracks', payload: [track] })
      expect(db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(1)
      expect(send).not.toHaveBeenCalledWith('library:changed', expect.anything())
      if (ending === 'cancel') await service.cancelScan(jobId)
      else if (ending === 'fatal')
        emitWorkerMessage(worker, { type: 'fatal', payload: { jobId, reason: 'failure' } })
      else
        emitWorkerMessage(worker, {
          type: 'complete',
          payload: { foundFilePaths: [track.filePath], unreadableDirectoryPaths: [] },
        })
      expect(db.prepare('SELECT file_path FROM tracks WHERE id=1').pluck().get()).toBe(
        ending === 'complete' ? track.filePath : 'C:\\Music\\old.flac',
      )
      expect(db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(1)
      // A later scan must never publish pending additions from the failed/canceled pass.
      if (ending !== 'complete') {
        await service.startScan(rootId)
        emitWorkerMessage(worker, {
          type: 'complete',
          payload: { foundFilePaths: ['C:\\Music\\old.flac'], unreadableDirectoryPaths: [] },
        })
        expect(db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(1)
      }
    },
  )

  it.each(['copy', 'ambiguous-new', 'unreadable-old'] as const)(
    'does not relocate for %s',
    async (scenario) => {
      const { db, service, worker, rootId, send } = createHarness()
      const old = 'C:\\Music\\old\\song.flac'
      db.prepare(
        "INSERT INTO tracks(id,file_path,title,artist,album,duration_seconds,file_size,availability) VALUES(1,?,'Song','Artist','Album',180,100,?)",
      ).run(old, scenario === 'unreadable-old' ? 'missing' : 'available')
      const track = {
        filePath: 'C:\\Music\\new.flac',
        fileSize: 100,
        fileMtimeMs: 1,
        title: 'Song',
        artist: 'Artist',
        album: 'Album',
        albumArtist: 'Artist',
        trackNo: null,
        discNo: null,
        durationSeconds: 180,
        year: null,
        releaseDate: null,
        copyright: null,
        composer: null,
        genre: 'Pop',
        artworkCacheKey: null,
        lyricsText: null,
        lyricsFormat: null,
        isrc: null,
        metadataSignature: 'test-signature',
      }
      await service.startScan(rootId)
      emitWorkerMessage(worker, { type: 'tracks', payload: [track] })
      if (scenario === 'ambiguous-new')
        emitWorkerMessage(worker, {
          type: 'tracks',
          payload: [{ ...track, filePath: 'C:\\Music\\another.flac' }],
        })
      emitWorkerMessage(worker, {
        type: 'complete',
        payload: {
          foundFilePaths: [
            track.filePath,
            ...(scenario === 'copy'
              ? [old]
              : scenario === 'ambiguous-new'
                ? ['C:\\Music\\another.flac']
                : []),
          ],
          unreadableDirectoryPaths: scenario === 'unreadable-old' ? ['C:\\Music\\old'] : [],
        },
      })
      expect(db.prepare('SELECT file_path FROM tracks WHERE id=1').pluck().get()).toBe(old)
      expect(db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(
        scenario === 'ambiguous-new' ? 3 : 2,
      )
      expect(send).not.toHaveBeenCalledWith(
        'library:changed',
        expect.objectContaining({ reason: 'track-relocated' }),
      )
    },
  )

  it('rolls back relocation and publishes no library changes when scan finalization fails', async () => {
    const { db, service, worker, rootId, send } = createHarness()
    const repo = new TrackRepository(db)
    const track = {
      filePath: 'C:\\Music\\old.flac',
      fileSize: 100,
      fileMtimeMs: 1,
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      albumArtist: 'Artist',
      trackNo: null,
      discNo: null,
      durationSeconds: 180,
      year: null,
      releaseDate: null,
      copyright: null,
      composer: null,
      genre: 'Pop',
      artworkCacheKey: null,
      lyricsText: null,
      lyricsFormat: null,
      isrc: null,
      metadataSignature: 'test-signature',
    }
    repo.upsertMany([track])
    const before = db.prepare('SELECT * FROM tracks').all()
    db.exec(
      "CREATE TRIGGER fail_scan_completion BEFORE UPDATE ON scan_jobs WHEN NEW.status='completed' BEGIN SELECT RAISE(ABORT,'injected completion failure'); END",
    )
    await service.startScan(rootId)
    emitWorkerMessage(worker, {
      type: 'tracks',
      payload: [{ ...track, filePath: 'C:\\Music\\new.flac' }],
    })
    emitWorkerMessage(worker, {
      type: 'complete',
      payload: { foundFilePaths: ['C:\\Music\\new.flac'], unreadableDirectoryPaths: [] },
    })
    expect(db.prepare('SELECT * FROM tracks').all()).toEqual(before)
    expect(service.getScanStatus()?.status).toBe('failed')
    expect(send).not.toHaveBeenCalledWith('library:changed', expect.anything())
    expect(service.isScanActive()).toBe(false)
  })

  it('retains the active worker when termination fails so shutdown can retry', async () => {
    const { service, worker, rootId } = createHarness()
    const { jobId } = await service.startScan(rootId)
    worker.terminate.mockRejectedValueOnce(new Error('termination failed'))
    await expect(service.shutdown()).rejects.toThrow('termination failed')
    expect(service.isScanActive()).toBe(true)
    await service.shutdown()
    expect(worker.terminate).toHaveBeenCalledTimes(2)
    expect(service.getScanStatus(jobId)?.status).toBe('canceled')
  })

  it('shuts down an active scan and ignores late errors after the database closes', async () => {
    const { service, worker, rootId, db } = createHarness()
    const { jobId } = await service.startScan(rootId)
    await service.shutdown()
    expect(service.getScanStatus(jobId)?.status).toBe('canceled')
    expect(worker.terminate).toHaveBeenCalledOnce()
    await expect(service.startScan(rootId)).rejects.toThrow('shutting down')
    db.close()
    expect(() => worker.emit('error', new Error('late failure'))).not.toThrow()
    worker.emit('exit', 1)
    await new Promise<void>((resolve) => setImmediate(resolve))
  })

  it('waits for scan preparation without starting a worker during shutdown', async () => {
    const { service, worker, rootId, workerOptions } = createHarness()
    let release!: () => void
    service.setScanLifecycleHooks({
      onStart: () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    })
    const start = service.startScan(rootId)
    const interrupted = expect(start).rejects.toThrow('shutdown')
    const shutdown = service.shutdown()
    release()
    await Promise.all([interrupted, shutdown])
    expect(workerOptions()).toBeNull()
    expect(worker.terminate).not.toHaveBeenCalled()
    expect(service.isScanActive()).toBe(false)
  })

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
