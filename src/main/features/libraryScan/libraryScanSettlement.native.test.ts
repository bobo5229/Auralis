import { Worker } from 'node:worker_threads'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, statSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import type Database from 'better-sqlite3'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { migrateDatabase } from '@main/database/schema'
import { DatabaseWriteAdmission } from '@main/database/databaseWriteAdmission'
import { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import { TrackRepository } from '@main/repositories/trackRepository'
import { ScanJobRepository } from '@main/repositories/scanJobRepository'
import { LibraryScanPersistence } from './libraryScanPersistence'
import { LibraryScanSettlementHost } from './libraryScanSettlementHost'
import { LibraryScanService } from './libraryScanService'
import { getLyricsSidecarFingerprintSync } from '../metadata/resolveLyricsForFile'
import { scanFileFingerprint } from './libraryScanFileFingerprint'
import type { ScannedTrackFile } from './libraryScanTypes'
import type { ScanSettlementEvent } from './libraryScanSettlementTypes'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
let directory: string
const opened: Database.Database[] = []
const hosts: LibraryScanSettlementHost[] = []
beforeAll(async () => {
  directory = mkdtempSync(join(resolve('output'), 'scan-settlement-'))
  for (const [entry, name] of [
    ['libraryScanSettlementWorker', 'worker'],
    ['libraryScanSettlement', 'runner'],
  ])
    await build({
      entryPoints: [`src/main/features/libraryScan/${entry}.ts`],
      outfile: join(directory, `${name}.cjs`),
      bundle: true,
      platform: 'node',
      format: 'cjs',
      external: ['better-sqlite3', 'pino', 'sharp'],
      alias: { '@main': resolve('src/main'), '@shared': resolve('src/shared') },
      logLevel: 'silent',
    })
  writeFileSync(
    join(directory, 'controlled.cjs'),
    `
    const {parentPort,workerData} = require('node:worker_threads');
    const {settleLibraryScan} = require('./runner.cjs');
    const control = new Int32Array(workerData.control);
    const barrier = () => { Atomics.store(control,0,1); Atomics.notify(control,0); Atomics.wait(control,1,0,10000) };
    try {
      settleLibraryScan(workerData, events => {
        parentPort.postMessage({type:'prepared',events});
        if(workerData.mode==='exit') process.exit(19);
        if(workerData.mode==='before' || workerData.mode==='terminate') barrier();
      }, () => { if(workerData.mode==='after') barrier() });
      if(workerData.mode==='lost') process.exit(17);
      parentPort.postMessage({type:'finished'});
    } catch(error) { parentPort.postMessage({type:'finished',error:error.message}) }
  `,
  )
}, 20_000)
afterAll(async () => {
  await Promise.all(hosts.map((host) => host.shutdown()))
  for (const db of opened) if (db.open) db.close()
  if (directory && directory.startsWith(join(resolve('output'), 'scan-settlement-')))
    rmSync(directory, { recursive: true, force: true })
})

function open(path: string) {
  const db = new DatabaseCtor(path)
  opened.push(db)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}
function fixture(name: string, count = 40) {
  const rootPath = join(directory, name)
  mkdirSync(rootPath)
  const db = open(join(directory, `${name}.sqlite`))
  migrateDatabase(db)
  const roots = new LibraryRootRepository(db),
    jobs = new ScanJobRepository(db),
    tracks = new TrackRepository(db)
  const root = roots.upsertByPath(rootPath)
  const job = jobs.create(root.id)
  jobs.updateProgress(job.jobId, count + 1, count + 1, 0)
  const files: ScannedTrackFile[] = Array.from({ length: count + 1 }, (_, i) => {
    const filePath = join(rootPath, `${i}.flac`)
    writeFileSync(filePath, 'isolated audio')
    const stat = statSync(filePath)
    return {
      filePath,
      fileFingerprint: scanFileFingerprint(stat),
      lyricsSidecarFingerprint: getLyricsSidecarFingerprintSync(filePath),
      title: `Track ${i}`,
      artist: 'Artist',
      album: 'Album',
      albumArtist: 'Artist',
      trackNo: i + 1,
      discNo: 1,
      durationSeconds: 180,
      bitrateBps: null,
      year: null,
      releaseDate: null,
      copyright: null,
      composer: null,
      genre: null,
      artworkCacheKey: null,
      lyricsText: null,
      lyricsFormat: null,
      isrc: null,
      metadataSignature: `identity ${i}`,
      fileSize: stat.size,
      fileMtimeMs: stat.mtimeMs,
    }
  })
  tracks.upsertMany([files[0]])
  const events: ScanSettlementEvent[] = []
  const listeners = {
    changed: (payload: Extract<ScanSettlementEvent, { type: 'changed' }>['payload']) =>
      events.push({ type: 'changed', payload }),
    progress: (payload: Extract<ScanSettlementEvent, { type: 'progress' }>['payload']) =>
      events.push({ type: 'progress', payload }),
  }
  const persistence = new LibraryScanPersistence(db, roots, jobs, tracks, listeners)
  persistence.begin()
  persistence.handleMessage({ type: 'tracks', payload: files.slice(1) }, job.jobId)
  const snapshot = persistence.exportSettlement()
  const complete = {
    foundFilePaths: files.map((file) => file.filePath),
    unreadableDirectoryPaths: [],
  }
  const admission = new DatabaseWriteAdmission()
  const control = new Int32Array(new SharedArrayBuffer(8))
  const runningWorkers: Worker[] = []
  function host(mode?: string, timeoutMs?: number) {
    const host = new LibraryScanSettlementHost(db, admission, listeners, {
      workerPath: process.env.AURALIS_SETTLEMENT_WORKER_PATH ?? join(directory, 'worker.cjs'),
      timeoutMs,
      createWorker: (path, options) => {
        const worker = new Worker(mode ? join(directory, 'controlled.cjs') : path, {
          ...options,
          workerData: { ...options.workerData, mode, control: control.buffer },
        })
        runningWorkers.push(worker)
        return worker
      },
    })
    hosts.push(host)
    return host
  }
  return {
    db,
    tracks,
    roots,
    jobs,
    job,
    root,
    admission,
    snapshot,
    complete,
    persistence,
    files,
    events,
    listeners,
    control,
    host,
    runningWorkers,
  }
}
function unblock(control: Int32Array) {
  Atomics.store(control, 1, 1)
  Atomics.notify(control, 1)
}

it('settles the actual Service/Host handoff with every inventory batch and finishes its lifecycle once', async () => {
  const f = fixture('service-handoff', 600)
  const reader = new EventEmitter() as EventEmitter & { terminate: ReturnType<typeof vi.fn> }
  reader.terminate = vi.fn(async () => 0)
  const settlement = f.host()
  const service = new LibraryScanService(
    f.db,
    join(directory, 'cache'),
    async () => join(directory, 'other'),
    f.listeners,
    () => reader as unknown as Worker,
    f.admission,
    settlement,
  )
  const onEnd = vi.fn()
  service.setScanLifecycleHooks({ onEnd })
  try {
    const { jobId } = await service.startScan(f.root.id)
    reader.emit('message', {
      type: 'progress',
      payload: {
        jobId,
        status: 'scanning',
        phase: 'settling',
        totalFiles: f.files.length,
        scannedFiles: f.files.length,
        failedFiles: 0,
        currentFile: null,
        message: 'Settling library scan',
      },
    })
    for (let start = 0; start < f.files.length; start += 300) {
      const files = f.files.slice(start, start + 300)
      reader.emit('message', {
        type: 'inventory',
        payload: {
          foundFilePaths: files.map((file) => file.filePath),
          unreadableDirectoryPaths: [],
        },
      })
      reader.emit('message', { type: 'tracks', payload: files })
    }
    reader.emit('message', {
      type: 'complete',
      payload: { foundFilePaths: [], unreadableDirectoryPaths: [] },
    })
    reader.emit('exit', 0)
    await vi.waitFor(() => expect(service.isScanActive()).toBe(false), { timeout: 5000 })
    expect(service.getScanStatus(jobId)?.status).toBe('completed')
    expect(
      f.db.prepare("SELECT COUNT(*) FROM tracks WHERE availability='available'").pluck().get(),
    ).toBe(601)
    expect(onEnd).toHaveBeenCalledOnce()
    expect(
      f.events.filter((event) => event.type === 'progress' && event.payload.status === 'completed'),
    ).toHaveLength(1)
    await expect(service.cancelScan(jobId)).resolves.toEqual({ ok: false })
  } finally {
    await service.shutdown()
  }
})

it('cancels an in-flight Service settlement and keeps the lifecycle owned until rollback', async () => {
  const f = fixture('service-cancel')
  const reader = new EventEmitter() as EventEmitter & { terminate: ReturnType<typeof vi.fn> }
  reader.terminate = vi.fn(async () => 0)
  const settlement = f.host('before')
  const service = new LibraryScanService(
    f.db,
    directory,
    async () => join(directory, 'other'),
    f.listeners,
    () => reader as unknown as Worker,
    f.admission,
    settlement,
  )
  const onEnd = vi.fn()
  service.setScanLifecycleHooks({ onEnd })
  try {
    const { jobId } = await service.startScan(f.root.id)
    reader.emit('message', { type: 'tracks', payload: f.files.slice(1) })
    reader.emit('message', { type: 'complete', payload: f.complete })
    await vi.waitFor(() => expect(Atomics.load(f.control, 0)).toBe(1), { timeout: 5000 })
    await expect(service.selectRoot()).rejects.toThrow('active')
    const cancel = service.cancelScan(jobId)
    expect(service.isScanActive()).toBe(true)
    expect(onEnd).not.toHaveBeenCalled()
    unblock(f.control)
    await expect(cancel).resolves.toEqual({ ok: true })
    expect(service.getScanStatus(jobId)?.status).toBe('canceled')
    expect(service.isScanActive()).toBe(false)
    expect(onEnd).toHaveBeenCalledOnce()
    expect(f.db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(1)
  } finally {
    unblock(f.control)
    await service.shutdown()
  }
})

it('does not replace scan ownership from a queued start before the committed scan finishes its lifecycle', async () => {
  const f = fixture('service-queued-start')
  const readers: Array<EventEmitter & { terminate: ReturnType<typeof vi.fn> }> = []
  const settlement = f.host('after')
  const service = new LibraryScanService(
    f.db,
    directory,
    async () => null,
    f.listeners,
    () => {
      const reader = new EventEmitter() as EventEmitter & { terminate: ReturnType<typeof vi.fn> }
      reader.terminate = vi.fn(async () => 0)
      readers.push(reader)
      return reader as unknown as Worker
    },
    f.admission,
    settlement,
  )
  const onStart = vi.fn(),
    onEnd = vi.fn()
  service.setScanLifecycleHooks({ onStart, onEnd })
  try {
    const first = await service.startScan(f.root.id)
    readers[0].emit('message', { type: 'tracks', payload: f.files.slice(1) })
    readers[0].emit('message', { type: 'complete', payload: f.complete })
    await vi.waitFor(() => expect(Atomics.load(f.control, 0)).toBe(1), { timeout: 5000 })
    const queued = service.startScan(f.root.id)
    unblock(f.control)
    await expect(queued).resolves.toEqual(first)
    await vi.waitFor(() => expect(service.isScanActive()).toBe(false))
    expect(onEnd).toHaveBeenCalledOnce()
    expect(onStart).toHaveBeenCalledOnce()
    expect(readers).toHaveLength(1)
    const second = await service.startScan(f.root.id)
    expect(second.jobId).not.toBe(first.jobId)
    expect(readers).toHaveLength(2)
    await service.cancelScan(second.jobId)
    expect(onEnd).toHaveBeenCalledTimes(2)
  } finally {
    unblock(f.control)
    await service.shutdown()
  }
})

it('matches the original complete transaction tables and exact events, and closes before publication', async () => {
  const count = process.env.AURALIS_SCAN_LOAD_MEASURE === '1' ? 10_000 : 100
  const f = fixture('equivalence', count)
  const copiedPath = join(directory, 'equivalence-worker.sqlite')
  await f.db.backup(copiedPath)
  const copy = open(copiedPath)
  const events: ScanSettlementEvent[] = []
  const admission = new DatabaseWriteAdmission()
  const host = new LibraryScanSettlementHost(
    copy,
    admission,
    {
      changed: (payload) => {
        copy.exec('BEGIN IMMEDIATE; ROLLBACK')
        events.push({ type: 'changed', payload })
      },
      progress: (payload) => events.push({ type: 'progress', payload }),
    },
    { workerPath: process.env.AURALIS_SETTLEMENT_WORKER_PATH ?? join(directory, 'worker.cjs') },
  )
  hosts.push(host)
  let lastTick = performance.now(),
    maxGap = 0,
    ticks = 0
  const timer = setInterval(() => {
    const now = performance.now()
    maxGap = Math.max(maxGap, now - lastTick)
    lastTick = now
    ticks++
  }, 5)
  await new Promise((resolve) => setTimeout(resolve, 15))
  maxGap = 0
  const baselineStart = performance.now()
  f.persistence.handleMessage({ type: 'complete', payload: f.complete }, f.job.jobId)
  const baselineMs = performance.now() - baselineStart
  await new Promise((resolve) => setTimeout(resolve, 15))
  const baselineMaxGap = maxGap
  maxGap = 0
  ticks = 0
  lastTick = performance.now()
  let queuedWriteWaitMs = 0
  const queuedWrite = new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      const scheduledAt = performance.now()
      void admission
        .runWrite(() => {
          queuedWriteWaitMs = performance.now() - scheduledAt
          copy.exec('UPDATE tracks SET title=title WHERE id=1')
        })
        .then(resolve, reject)
    }, 25)
  })
  const workerStart = performance.now()
  await host.settle(f.job.jobId, f.snapshot, f.complete)
  const workerMs = performance.now() - workerStart
  await queuedWrite
  await new Promise((resolve) => setTimeout(resolve, 15))
  clearInterval(timer)
  if (count === 10_000)
    writeFileSync(
      resolve('output/backend-write-admission-p3-20261107/settlement-load-current.json'),
      JSON.stringify(
        {
          count,
          baselineMs,
          baselineMaxGap,
          workerMs,
          workerMaxGap: maxGap,
          mainTicksDuringWorker: ticks,
          queuedWriteWaitMs,
          versions: process.versions,
          scope:
            'One synthetic shared-album run; real Worker, SQLite/WAL, final file/lyrics checks; no audio parsing or GUI. Tables/events compared below.',
        },
        null,
        2,
      ),
    )
  const volatile = new Set([
    'created_at',
    'updated_at',
    'started_at',
    'finished_at',
    'last_scanned_at',
    'refreshed_at',
    'removed_at',
    'added_at',
  ])
  const rows = (db: Database.Database, table: string) =>
    db
      .prepare(`SELECT * FROM "${table}"`)
      .all()
      .map((row) =>
        JSON.stringify(
          Object.fromEntries(Object.entries(row as object).filter(([key]) => !volatile.has(key))),
        ),
      )
      .sort()
  const tables = f.db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .pluck()
    .all() as string[]
  for (const table of tables) expect(rows(copy, table), table).toEqual(rows(f.db, table))
  expect(events).toEqual(f.events)
  expect(copy.pragma('foreign_key_check')).toEqual([])
  expect(copy.pragma('integrity_check', { simple: true })).toBe('ok')
}, 60_000)

it.each(['before', 'after'] as const)(
  'linearizes cancellation %s the commit decision while writes wait and reads remain committed',
  async (mode) => {
    const f = fixture(mode)
    const host = f.host(mode)
    const settled = host.settle(f.job.jobId, f.snapshot, f.complete)
    await vi.waitFor(() => expect(Atomics.load(f.control, 0)).toBe(1), { timeout: 5000 })
    expect(f.db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(1)
    let wrote = false
    const queued = f.admission.runWrite(() => {
      f.db.exec('UPDATE tracks SET title=title WHERE id=1')
      wrote = true
    })
    await Promise.resolve()
    expect(wrote).toBe(false)
    expect(host.requestCancel(f.job.jobId)).toBe(mode === 'before')
    unblock(f.control)
    await settled
    await queued
    expect(f.jobs.getById(f.job.jobId)?.status).toBe(mode === 'before' ? 'canceled' : 'completed')
    expect(f.db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(
      mode === 'before' ? 1 : 41,
    )
    expect(f.events.filter((event) => event.type === 'progress')).toHaveLength(1)
    expect(wrote).toBe(true)
  },
)

it.each(['exit', 'lost'] as const)(
  'reconciles %s from durable job state rather than an absent acknowledgement',
  async (mode) => {
    const f = fixture(mode)
    await f.host(mode).settle(f.job.jobId, f.snapshot, f.complete)
    expect(f.jobs.getById(f.job.jobId)?.status).toBe(mode === 'lost' ? 'completed' : 'failed')
    expect(f.db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(mode === 'lost' ? 41 : 1)
    expect(f.events.filter((event) => event.type === 'changed')).toHaveLength(
      mode === 'lost' ? 1 : 0,
    )
    expect(f.events.filter((event) => event.type === 'progress')).toHaveLength(1)
    f.db.exec('BEGIN IMMEDIATE; ROLLBACK')
  },
)

it('can cancel before exclusive admission without starting a worker', async () => {
  const f = fixture('queued')
  const lease = await f.admission.acquireExclusive()
  const host = f.host()
  const pending = host.settle(f.job.jobId, f.snapshot, f.complete)
  expect(host.requestCancel(f.job.jobId)).toBe(true)
  lease.release()
  await pending
  expect(f.jobs.getById(f.job.jobId)?.status).toBe('canceled')
  expect(f.db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(1)
})

it('retains the exclusive lease after termination rejection and safely retries connection cleanup', async () => {
  const f = fixture('terminate-retry')
  const host = f.host('terminate', 500)
  const running = host.settle(f.job.jobId, f.snapshot, f.complete)
  const failure = expect(running).rejects.toThrow('termination rejected')
  await vi.waitFor(() => expect(f.runningWorkers).toHaveLength(1))
  vi.spyOn(f.runningWorkers[0], 'terminate').mockRejectedValueOnce(
    new Error('termination rejected'),
  )
  await vi.waitFor(() => expect(Atomics.load(f.control, 0)).toBe(1), { timeout: 5000 })
  await failure
  expect(host.isActive()).toBe(true)
  expect(f.jobs.getById(f.job.jobId)?.status).toBe('scanning')
  let wrote = false
  const queued = f.admission.runWrite(() => {
    f.db.exec('UPDATE tracks SET title=title WHERE id=1')
    wrote = true
  })
  await Promise.resolve()
  expect(wrote).toBe(false)
  await host.wait(f.job.jobId)
  await queued
  expect(wrote).toBe(true)
  expect(host.isActive()).toBe(false)
  expect(f.jobs.getById(f.job.jobId)?.status).toBe('failed')
  expect(f.db.prepare('SELECT COUNT(*) FROM tracks').pluck().get()).toBe(1)
})
