import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../database/schema'
import { PlaylistRepository } from '../repositories/playlistRepository'
import { SmartPlaylistRepository } from '../repositories/smartPlaylistRepository'
import { PlaylistService } from './playlistService'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as typeof Database

describe('atomic playlist writes', () => {
  let directory: string
  let path: string
  let db: Database.Database
  let other: Database.Database | undefined
  let repository: PlaylistRepository
  let smart: SmartPlaylistRepository
  let service: PlaylistService

  function open() {
    db = new DatabaseCtor(path, { timeout: 10 })
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    repository = new PlaylistRepository(db)
    smart = new SmartPlaylistRepository(db)
    service = new PlaylistService(repository, smart)
  }

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'auralis-playlist-writes-'))
    path = join(directory, 'isolated.sqlite')
    open()
    migrateDatabase(db)
    db.exec(`INSERT INTO tracks(id, file_path, title) VALUES
      (1, 'fixture-one.flac', 'One'), (2, 'fixture-two.flac', 'Two'),
      (3, 'fixture-three.flac', 'Three')`)
    repository.create('Regular', 7)
    smart.create('Smart', { conditions: [{ field: 'genre', value: 'Rock' }] })
  })

  afterEach(() => {
    if (other?.open) {
      if (other.inTransaction) other.exec('ROLLBACK')
      other.close()
    }
    other = undefined
    if (db?.open) db.close()
    // Only this test's freshly created temporary directory is removed.
    rmSync(directory, { recursive: true, force: true })
  })

  const reordered = [
    { kind: 'smart' as const, id: 1 },
    { kind: 'playlist' as const, id: 1 },
  ]
  function storedRows() {
    return {
      regular: db.prepare('SELECT * FROM playlists ORDER BY id').all(),
      smart: db.prepare('SELECT * FROM smart_playlists ORDER BY id').all(),
      members: db.prepare('SELECT * FROM playlist_tracks ORDER BY position').all(),
    }
  }

  it('creates both playlist kinds in cover view and preserves existing saved flat views', () => {
    expect(repository.getById(1)?.viewMode).toBe('cover')
    expect(smart.getById(1)?.viewMode).toBe('cover')
    repository.updateViewMode(1, 'flat')
    smart.updateViewMode(1, 'flat')
    const regular = service.create('New regular')
    const intelligent = smart.create('New smart', {
      conditions: [{ field: 'genre', value: 'Jazz' }],
    })
    expect(regular.viewMode).toBe('cover')
    expect(intelligent.viewMode).toBe('cover')
    db.close()
    open()
    expect(repository.getById(regular.id)?.viewMode).toBe('cover')
    expect(smart.getById(intelligent.id)?.viewMode).toBe('cover')
    expect(repository.getById(1)?.viewMode).toBe('flat')
    expect(smart.getById(1)?.viewMode).toBe('flat')
  })

  it('persists mixed order across reopening while preserving same-ID identities and all other data', () => {
    service.addTracks(1, [3, 1, 2, 1])
    repository.updateViewMode(1, 'cover')
    const before = storedRows()
    expect(
      service
        .reorderSidebarItems(reordered)
        .map(({ kind, id, sortOrder }) => ({ kind, id, sortOrder })),
    ).toEqual([
      { kind: 'smart', id: 1, sortOrder: 0 },
      { kind: 'playlist', id: 1, sortOrder: 1 },
    ])
    db.close()
    open()
    const after = storedRows()
    expect(after.members).toEqual(before.members)
    expect(repository.getById(1)).toMatchObject({
      name: 'Regular',
      viewMode: 'cover',
      sortOrder: 1,
    })
    expect(smart.getById(1)).toMatchObject({
      name: 'Smart',
      sortOrder: 0,
      rule: { conditions: [{ field: 'genre', value: 'Rock' }] },
    })
    for (const table of ['regular', 'smart'] as const) {
      const withoutOrder = (rows: unknown[]) =>
        rows.map((row) => {
          return Object.fromEntries(
            Object.entries(row as Record<string, unknown>).filter(
              ([key]) => key !== 'sort_order' && key !== 'updated_at',
            ),
          )
        })
      expect(withoutOrder(after[table])).toEqual(withoutOrder(before[table]))
    }
  })

  it.each([
    [{ kind: 'playlist' as const, id: 1 }],
    [
      { kind: 'playlist' as const, id: 1 },
      { kind: 'playlist' as const, id: 1 },
    ],
    [
      { kind: 'smart' as const, id: 99 },
      { kind: 'playlist' as const, id: 1 },
    ],
  ])('leaves every row untouched for a stale or invalid order %j', (...items) => {
    const before = storedRows()
    service.reorderSidebarItems(items)
    expect(storedRows()).toEqual(before)
  })

  it('rolls back the first table update when the second table write fails, including after reopening', () => {
    const before = storedRows()
    db.exec(`CREATE TRIGGER fail_regular_order BEFORE UPDATE OF sort_order ON playlists
      BEGIN SELECT RAISE(ABORT, 'fixture second write failure'); END`)
    expect(() => service.reorderSidebarItems(reordered)).toThrow('fixture second write failure')
    expect(db.inTransaction).toBe(false)
    db.close()
    open()
    expect(storedRows()).toEqual(before)
  })

  it('holds the writer lock from validation through both table writes', () => {
    other = new DatabaseCtor(path, { timeout: 0 })
    let attempted = false
    db.function('try_competing_writer', () => {
      attempted = true
      expect(() => other!.exec('BEGIN IMMEDIATE')).toThrow(/locked/)
      return 0
    })
    db.exec(`CREATE TEMP TRIGGER inspect_writer_lock AFTER UPDATE OF sort_order ON smart_playlists
      BEGIN SELECT try_competing_writer(); END`)
    service.reorderSidebarItems(reordered)
    expect(attempted).toBe(true)
    db.close()
    open()
    expect(repository.getById(1)?.sortOrder).toBe(1)
    expect(smart.getById(1)?.sortOrder).toBe(0)
  })

  it('does not change either table when another real SQLite connection owns the writer lock', () => {
    const before = storedRows()
    other = new DatabaseCtor(path)
    other.exec('BEGIN IMMEDIATE')
    expect(() => service.reorderSidebarItems(reordered)).toThrow(/locked/)
    other.exec('ROLLBACK')
    db.close()
    open()
    expect(storedRows()).toEqual(before)
  })

  it('distinguishes added, duplicate, unavailable and deleted-target results', () => {
    expect(service.addTracks(1, [1, 1])).toEqual({
      addedCount: 1,
      alreadyPresentCount: 0,
      unavailableCount: 0,
      playlistExists: true,
    })
    expect(service.addTracks(1, [1])).toEqual({
      addedCount: 0,
      alreadyPresentCount: 1,
      unavailableCount: 0,
      playlistExists: true,
    })
    db.exec("UPDATE tracks SET availability = 'missing' WHERE id = 2")
    expect(service.addTracks(1, [1, 2, 3, 99])).toEqual({
      addedCount: 1,
      alreadyPresentCount: 1,
      unavailableCount: 2,
      playlistExists: true,
    })
    expect(repository.getTrackIds(1)).toEqual([1, 3])
    expect(service.addTracks(1, [2])).toMatchObject({
      addedCount: 0,
      alreadyPresentCount: 0,
      unavailableCount: 1,
      playlistExists: true,
    })
    repository.delete(1)
    expect(service.addTracks(1, [1])).toEqual({
      addedCount: 0,
      alreadyPresentCount: 0,
      unavailableCount: 0,
      playlistExists: false,
    })
  })

  it('propagates actual insertion failures and rolls back all members', () => {
    db.exec(`CREATE TRIGGER fail_second_member BEFORE INSERT ON playlist_tracks WHEN NEW.track_id = 2
      BEGIN SELECT RAISE(ABORT, 'fixture member write failure'); END`)
    expect(() => service.addTracks(1, [1, 2])).toThrow('fixture member write failure')
    expect(repository.getTrackIds(1)).toEqual([])
  })

  it('reports missing-before-add as unavailable and leaves the target empty, then supports recovery', () => {
    db.exec("UPDATE tracks SET availability = 'missing' WHERE id = 1")
    expect(service.addTracks(1, [1])).toEqual({
      addedCount: 0,
      alreadyPresentCount: 0,
      unavailableCount: 1,
      playlistExists: true,
    })
    expect(repository.getTrackIds(1)).toEqual([])
    expect(service.getDetail(1)?.tracks).toEqual([])
    db.exec("UPDATE tracks SET availability = 'available' WHERE id = 1")
    expect(service.addTracks(1, [1])).toMatchObject({ addedCount: 1, unavailableCount: 0 })
    expect(repository.getTrackIds(1)).toEqual([1])
  })
})
