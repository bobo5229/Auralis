import { createRequire } from 'node:module'
import type Database from 'better-sqlite3'
import { expect, it, vi } from 'vitest'
import { migrateDatabase } from '@main/database/schema'
import { PlaylistRepository } from '@main/repositories/playlistRepository'
import { SmartPlaylistRepository } from '@main/repositories/smartPlaylistRepository'
import { TrackRepository } from '@main/repositories/trackRepository'
import { SmartPlaylistService } from './smartPlaylistService'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as typeof Database

it('preserves legacy expression-based recent-addition ordering across all detail readers', async () => {
  const db = new DatabaseCtor(':memory:')
  try {
    migrateDatabase(db)
    db.exec(`INSERT INTO tracks(id,file_path,title,artist,album,created_at) VALUES
      (1,'old.flac','Old','A','Older',datetime('now','-2 days')),
      (2,'new.flac','New','Z','Newer',datetime('now','-1 day'))`)
    const tracks = new TrackRepository(db)
    const smart = new SmartPlaylistRepository(db)
    const playlist = smart.create('最近添加', {
      expression: { type: 'predicate', field: 'added', operator: 'addedWithin', value: '7 days' },
    })
    const service = new SmartPlaylistService(smart, tracks, undefined, async () => tracks.getAll())
    expect(tracks.getAll().map((track) => track.id)).toEqual([1, 2])
    expect((await service.getDetailAsync(playlist.id))!.tracks.map((track) => track.id)).toEqual([
      2, 1,
    ])
    expect((await service.getMembership(playlist.id))!.trackIds).toEqual([2, 1])
    expect(service.getDetail(playlist.id)!.tracks.map((track) => track.id)).toEqual([2, 1])
  } finally {
    db.close()
  }
})

it('returns ordered available playlist members and the library revision in one read snapshot', () => {
  const db = new DatabaseCtor(':memory:')
  try {
    migrateDatabase(db)
    db.exec(
      "INSERT INTO tracks(id,file_path,title) VALUES (1,'one.flac','One'),(2,'two.flac','Two'),(3,'three.flac','Three')",
    )
    const repo = new PlaylistRepository(db)
    const playlist = repo.create('Ordered', 0)
    repo.addTracks(playlist.id, [3, 2, 1])
    db.exec("UPDATE tracks SET availability='missing' WHERE id=2")
    const first = repo.getMembership(playlist.id)!
    expect(first.trackIds).toEqual([3, 1])
    expect(first.libraryRevision).toBe(new TrackRepository(db).getChangeToken())
    db.exec("UPDATE tracks SET title='Updated' WHERE id=1")
    expect(repo.getMembership(playlist.id)!.libraryRevision).not.toBe(first.libraryRevision)
    repo.delete(playlist.id)
    expect(repo.getMembership(playlist.id)).toBeNull()
  } finally {
    db.close()
  }
})

it('loads smart playlist catalogs asynchronously, reuses revisions and refreshes after mutations', async () => {
  const db = new DatabaseCtor(':memory:')
  try {
    migrateDatabase(db)
    db.exec(
      "INSERT INTO tracks(id,file_path,title,genre) VALUES (1,'one.flac','One','Rock'),(2,'two.flac','Two','Jazz')",
    )
    const tracks = new TrackRepository(db)
    const smart = new SmartPlaylistRepository(db)
    const playlist = smart.create('Rock', { conditions: [{ field: 'genre', value: 'Rock' }] })
    const load = vi.fn(async () => tracks.getAll())
    const service = new SmartPlaylistService(smart, tracks, undefined, load)
    expect((await service.getMembership(playlist.id))!.trackIds).toEqual([1])
    await service.listTrackCountsAsync()
    await service.getDetailAsync(playlist.id)
    expect(load).toHaveBeenCalledOnce()
    db.exec("UPDATE tracks SET genre='Rock' WHERE id=2")
    expect((await service.getMembership(playlist.id))!.trackIds).toEqual([1, 2])
    expect(load).toHaveBeenCalledTimes(2)
    expect(await service.getMembership(999)).toBeNull()
  } finally {
    db.close()
  }
})

it('retries a catalog that changed while its asynchronous read was pending', async () => {
  const db = new DatabaseCtor(':memory:')
  try {
    migrateDatabase(db)
    db.exec("INSERT INTO tracks(id,file_path,title,genre) VALUES (1,'one.flac','One','Rock')")
    const tracks = new TrackRepository(db)
    const smart = new SmartPlaylistRepository(db)
    const playlist = smart.create('Rock', { conditions: [{ field: 'genre', value: 'Rock' }] })
    const load = vi.fn(async () => {
      const result = tracks.getAll()
      if (load.mock.calls.length === 1) db.exec("UPDATE tracks SET genre='Jazz' WHERE id=1")
      return result
    })
    const service = new SmartPlaylistService(smart, tracks, undefined, load)
    expect((await service.getMembership(playlist.id))!.trackIds).toEqual([])
    expect(load).toHaveBeenCalledTimes(2)
  } finally {
    db.close()
  }
})
