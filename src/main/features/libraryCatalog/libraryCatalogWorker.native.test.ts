import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { build } from 'esbuild'
import type Database from 'better-sqlite3'
import { beforeAll, afterAll, expect, it, vi } from 'vitest'
import { migrateDatabase } from '@main/database/schema'
import { TrackRepository } from '@main/repositories/trackRepository'
import { LibraryRepository } from '@main/repositories/libraryRepository'
import { LibraryService } from '@main/services/libraryService'
import { LibraryCatalogWorkerHost } from './libraryCatalogWorkerHost'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
let directory: string
beforeAll(async () => {
  directory = mkdtempSync(join(resolve('output'), 'catalog-worker-'))
  await build({
    entryPoints: ['src/main/features/libraryCatalog/libraryCatalogWorker.ts'],
    outfile: join(directory, 'worker.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['better-sqlite3'],
    alias: { '@main': resolve('src/main'), '@shared': resolve('src/shared') },
    logLevel: 'silent',
  })
})
afterAll(() => {
  if (directory && directory.startsWith(join(resolve('output'), 'catalog-worker-')))
    rmSync(directory, { recursive: true, force: true })
})
function fixture(name: string, options = {}) {
  const db = new DatabaseCtor(join(directory, `${name}.sqlite`))
  db.pragma('journal_mode = WAL')
  migrateDatabase(db)
  db.transaction(() => {
    const insert = db.prepare(
      'INSERT INTO tracks(id,file_path,title,artist,album,album_artist,track_no) VALUES(?,?,?,?,?,?,?)',
    )
    for (let id = 1; id <= 1000; id++)
      insert.run(id, `${id}.flac`, `Track ${id}`, '周杰伦', 'Album', '周杰伦', 1001 - id)
  })()
  const host = new LibraryCatalogWorkerHost(db.name, {
    workerPath: join(directory, 'worker.cjs'),
    ...options,
  })
  return { db, host, repository: new TrackRepository(db) }
}

it('loads the whole sorted catalog off the main thread, coalesces consumers and preserves old cursors on stats refresh', async () => {
  const f = fixture('pages')
  const expected = f.repository.getAll().map((track) => track.id)
  const sync = vi.spyOn(f.repository, 'getAll').mockImplementation(() => {
    throw new Error('full query on main thread')
  })
  const service = new LibraryService(new LibraryRepository(f.db), f.repository, f.host)
  let ticks = 0
  const timer = setInterval(() => ticks++, 1)
  try {
    const [first, other] = await Promise.all([
      service.getTrackPage({ refresh: true, limit: 10 }),
      service.getTrackPage({ refresh: true, limit: 10 }),
    ])
    expect(first.snapshotId).toBe(other.snapshotId)
    expect(first.totalTracks).toBe(1000)
    expect(ticks).toBeGreaterThan(0)
    const changedId = expected[10]
    f.db.prepare('INSERT INTO track_play_stats(track_id,play_count) VALUES(?,9)').run(changedId)
    const updated = await service.getTrackPage({ refresh: true, limit: 1000 })
    expect(updated.tracks.map((track) => track.id)).toEqual(expected)
    expect(updated.tracks[10].playCount).toBe(9)
    const old = await service.getTrackPage({ cursor: first.nextCursor!, limit: 1 })
    expect(old.tracks[0].id).toBe(changedId)
    expect(old.tracks[0].playCount).toBe(0)
    expect((await service.getTracks()).map((track) => track.id)).toEqual(expected)
    expect(sync).not.toHaveBeenCalled()
  } finally {
    clearInterval(timer)
    await service.dispose()
    f.db.close()
  }
})

it('reads the committed WAL snapshot and recreates its idle read-only connection', async () => {
  const f = fixture('wal', { idleMs: 10 })
  try {
    f.db.exec("BEGIN IMMEDIATE; UPDATE tracks SET title='not committed' WHERE id=1")
    const before = await f.host.load()
    expect(before.tracks.find((track) => track.id === 1)?.title).toBe('Track 1')
    f.db.exec('ROLLBACK')
    await delay(30)
    f.db.exec("UPDATE tracks SET title='committed' WHERE id=1")
    const after = await f.host.load()
    expect(after.revision).not.toBe(before.revision)
    expect(after.tracks.find((track) => track.id === 1)?.title).toBe('committed')
  } finally {
    await f.host.shutdown()
    f.db.close()
  }
})

it('reports timeout and closes the connection before shutdown completes', async () => {
  const f = fixture('timeout', { timeoutMs: 1 })
  try {
    await expect(f.host.load()).rejects.toThrow('timed out')
    await f.host.shutdown()
    await expect(f.host.load()).rejects.toThrow('shutting down')
    expect(f.db.pragma('integrity_check', { simple: true })).toBe('ok')
  } finally {
    await f.host.shutdown()
    f.db.close()
  }
})
