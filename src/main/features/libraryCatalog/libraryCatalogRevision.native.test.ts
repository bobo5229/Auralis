import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { migrateDatabase } from '@main/database/schema'
import { migrations } from '@main/database/schemaMigrations'
import { TrackRepository } from '@main/repositories/trackRepository'
import { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import { ScanJobRepository } from '@main/repositories/scanJobRepository'
import { LibraryCatalogSnapshotStore } from './libraryCatalogSnapshotStore'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as new (
  path: string,
) => Database.Database
const databases: Database.Database[] = []
const directories: string[] = []

function openDatabase(path = ':memory:'): Database.Database {
  const db = new DatabaseCtor(path)
  databases.push(db)
  return db
}

function createCatalog(db = openDatabase()) {
  migrateDatabase(db)
  db.exec(`INSERT INTO tracks(id,file_path,title,artist,album,album_artist)
    VALUES(1,'one.flac','One','Artist','Album','Artist'),
          (2,'two.flac','Two','Artist','Album','Artist')`)
  const repository = new TrackRepository(db)
  const load = vi.fn(() => repository.getAll())
  const store = new LibraryCatalogSnapshotStore(load, Date.now, () => repository.getChangeToken())
  return { db, repository, load, store }
}

afterEach(() => {
  for (const db of databases.splice(0)) if (db.open) db.close()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('catalog revisions', () => {
  it('reuses the catalog and keeps cursors valid across scan progress and playlist writes', () => {
    const { db, store, load } = createCatalog()
    const root = new LibraryRootRepository(db).upsertByPath('C:\\IsolatedCatalog')
    const jobs = new ScanJobRepository(db)
    const job = jobs.create(root.id)
    const first = store.getPage({ refresh: true, limit: 1 })
    jobs.updateProgress(job.jobId, 2, 1, 0)
    expect(store.getPage({ refresh: true }).snapshotId).toBe(first.snapshotId)
    jobs.updateProgress(job.jobId, 2, 2, 0)
    jobs.finish(job.jobId, 'completed')
    db.exec(
      "INSERT INTO playlists(id,name) VALUES(1,'Favorites'); INSERT INTO playlist_tracks(playlist_id,track_id,position) VALUES(1,1,0)",
    )
    expect(store.getPage({ refresh: true }).snapshotId).toBe(first.snapshotId)
    expect(store.getPage({ cursor: first.nextCursor! }).tracks.map((track) => track.id)).toEqual([
      2,
    ])
    expect(load).toHaveBeenCalledTimes(1)
  })

  const metadata =
    "INSERT INTO track_metadata(track_id,title,source) VALUES(1,'Override','user_edit')"
  const album =
    "INSERT INTO albums(title,artist,artwork_cache_key) VALUES('Album','Artist','cover.webp')"
  const stats = 'INSERT INTO track_play_stats(track_id,play_count) VALUES(1,3)'
  it.each([
    {
      name: 'track insert',
      setup: '',
      change: "INSERT INTO tracks(file_path,title) VALUES('three.flac','Three')",
    },
    { name: 'track update', setup: '', change: "UPDATE tracks SET title='Changed' WHERE id=1" },
    { name: 'track delete', setup: '', change: 'DELETE FROM tracks WHERE id=1' },
    { name: 'metadata insert', setup: '', change: metadata },
    {
      name: 'metadata update',
      setup: metadata,
      change: "UPDATE track_metadata SET title='Changed' WHERE track_id=1",
    },
    {
      name: 'metadata delete',
      setup: metadata,
      change: 'DELETE FROM track_metadata WHERE track_id=1',
    },
    { name: 'album insert', setup: '', change: album },
    {
      name: 'album update',
      setup: album,
      change: "UPDATE albums SET artwork_cache_key='new-cover.webp'",
    },
    { name: 'album delete', setup: album, change: 'DELETE FROM albums' },
    { name: 'stats insert', setup: '', change: stats },
    {
      name: 'stats update',
      setup: stats,
      change: "UPDATE track_play_stats SET last_played_at='2026-10-18 00:00:00' WHERE track_id=1",
    },
    { name: 'stats delete', setup: stats, change: 'DELETE FROM track_play_stats' },
  ])('refreshes visible catalog data after $name', ({ setup, change }) => {
    const { db, store } = createCatalog()
    if (setup) db.exec(setup)
    const before = store.getPage({ refresh: true })
    db.exec(change)
    const after = store.getPage({ refresh: true })
    expect(after.snapshotId).not.toBe(before.snapshotId)
    expect(after.tracks).not.toEqual(before.tracks)
  })

  it('ignores no-op and bookkeeping updates on catalog tables', () => {
    const { db, repository } = createCatalog()
    db.exec(`${metadata}; ${album}; ${stats}`)
    const before = repository.getChangeToken()
    db.exec(`
      UPDATE tracks SET title=title, file_mtime_ms=123, metadata_checked_mtime_ms=123;
      UPDATE track_metadata SET title=title, refreshed_at='2026-10-18 00:00:00';
      UPDATE albums SET artwork_cache_key=artwork_cache_key, updated_at='2026-10-18 00:00:00';
      UPDATE track_play_stats SET play_count=play_count, updated_at='2026-10-18 00:00:00';
    `)
    expect(repository.getChangeToken()).toBe(before)
  })

  it('observes committed worker writes, ignores rollbacks, and preserves the old snapshot', () => {
    const directory = mkdtempSync(join(tmpdir(), 'auralis-catalog-revision-'))
    directories.push(directory)
    const path = join(directory, 'catalog.sqlite')
    const { db, repository, store } = createCatalog(openDatabase(path))
    db.pragma('journal_mode = WAL')
    const worker = openDatabase(path)
    const first = store.getPage({ refresh: true, limit: 1 })
    const before = repository.getChangeToken()
    worker.exec("BEGIN; UPDATE tracks SET title='Rolled back' WHERE id=2")
    expect(repository.getChangeToken()).toBe(before)
    worker.exec('ROLLBACK')
    expect(repository.getChangeToken()).toBe(before)
    worker.exec("UPDATE tracks SET title='Worker title' WHERE id=2")
    expect(repository.getChangeToken()).not.toBe(before)
    const latest = store.getPage({ refresh: true })
    expect(latest.tracks.find((track) => track.id === 2)?.title).toBe('Worker title')
    expect(store.getPage({ cursor: first.nextCursor! }).tracks[0].title).toBe('Two')
  })

  it('adds the revision to a populated v27 database without changing existing rows', () => {
    const db = openDatabase()
    db.exec(
      'CREATE TABLE schema_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    )
    for (const migration of migrations.filter((migration) => migration.id <= 27)) {
      db.exec(migration.sql)
      db.prepare('INSERT INTO schema_migrations(id,name) VALUES(?,?)').run(
        migration.id,
        migration.name,
      )
    }
    db.exec("INSERT INTO tracks(id,file_path,title) VALUES(1,'one.flac','One')")
    db.exec(
      `${metadata}; ${album}; ${stats}; INSERT INTO playlists(id,name) VALUES(1,'Favorites'); INSERT INTO playlist_tracks(playlist_id,track_id,position) VALUES(1,1,0)`,
    )
    const tables = [
      'tracks',
      'track_metadata',
      'albums',
      'track_play_stats',
      'playlists',
      'playlist_tracks',
    ]
    const before = tables.map((table) => db.prepare(`SELECT * FROM ${table}`).all())
    migrateDatabase(db)
    migrateDatabase(db)
    expect(tables.map((table) => db.prepare(`SELECT * FROM ${table}`).all())).toEqual(before)
    expect(new TrackRepository(db).getChangeToken()).toBe('0')
    expect(db.pragma('foreign_key_check')).toEqual([])
    db.exec("UPDATE tracks SET title='Changed' WHERE id=1")
    expect(new TrackRepository(db).getChangeToken()).not.toBe('0')
  })
})
