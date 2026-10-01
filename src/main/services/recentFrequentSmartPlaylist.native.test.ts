import { createRequire } from 'node:module'
import type Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migrateDatabase } from '../database/schema'
import { SmartPlaylistRepository } from '../repositories/smartPlaylistRepository'
import { TrackRepository } from '../repositories/trackRepository'
import { SmartPlaylistService } from './smartPlaylistService'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as typeof Database

describe('recent frequent smart playlists', () => {
  let db: Database.Database
  let repository: SmartPlaylistRepository
  let service: SmartPlaylistService

  beforeEach(() => {
    // Fake only the clock; no user database or music files are touched.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 2, 12))
    db = new DatabaseCtor(':memory:')
    migrateDatabase(db)
    db.exec(`INSERT INTO tracks(id, file_path, title, genre) VALUES
      (1, 'one.flac', 'One', 'Rock'), (2, 'two.flac', 'Two', 'Rock'),
      (3, 'three.flac', 'Three', 'Jazz'), (4, 'four.flac', 'Four', 'Rock'),
      (5, 'missing.flac', 'Missing', 'Rock');
      UPDATE tracks SET availability = 'missing' WHERE id = 5;`)
    repository = new SmartPlaylistRepository(db)
    service = new SmartPlaylistService(repository, new TrackRepository(db))
  })

  afterEach(() => {
    db?.close()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function plays(trackId: number, date: string, count: number, last = `${date}T10:00:00Z`) {
    db.prepare(
      `INSERT INTO daily_track_play_stats
      (play_date, track_id, play_count, duration_seconds, last_played_at)
      VALUES (?, ?, ?, 0, ?)`,
    ).run(date, trackId, count, last)
  }

  it('defaults to 30 days, persists the preset, and reuses identical rules', () => {
    const created = service.createRecentFrequent()
    expect(created.created).toBe(true)
    expect(created.playlist.name).toBe('最近常听')
    expect(repository.getById(created.playlist.id)?.rule).toEqual({
      preset: 'recentFrequent',
      days: 30,
    })
    expect(service.createRecentFrequent(30)).toEqual({ playlist: created.playlist, created: false })
    expect(service.createRecentFrequent(12).created).toBe(true)
    expect(service.getDetail(created.playlist.id)?.tracks).toEqual([])
  })

  it('uses only in-range counts, excludes unavailable tracks, and breaks ties by latest play', () => {
    plays(1, '2026-09-29', 100)
    plays(1, '2026-09-30', 2)
    plays(2, '2026-10-01', 3)
    plays(3, '2026-09-30', 1)
    plays(3, '2026-10-02', 2)
    plays(4, '2026-10-03', 500)
    plays(5, '2026-10-02', 999)
    const playlist = service.createRecentFrequent(3).playlist
    expect(service.getDetail(playlist.id)?.tracks.map((track) => track.id)).toEqual([3, 2, 1])
    expect(service.listTrackCounts()).toEqual([{ playlistId: playlist.id, trackCount: 3 }])
    service.rename(playlist.id, 'My frequent songs')
    expect(service.getDetail(playlist.id)?.tracks.map((track) => track.id)).toEqual([3, 2, 1])
  })

  it('updates the same playlist without changing its name, mode or sidebar order', () => {
    plays(1, '2026-09-20', 4)
    plays(2, '2026-10-02', 1)
    const playlist = service.createRecentFrequent().playlist
    service.rename(playlist.id, 'Custom name')
    service.updateViewMode(playlist.id, 'cover')
    const updated = service.updateRecentFrequentDays(playlist.id, 3)
    expect(updated).toMatchObject({
      id: playlist.id,
      name: 'Custom name',
      viewMode: 'cover',
      sortOrder: playlist.sortOrder,
      rule: { preset: 'recentFrequent', days: 3 },
    })
    expect(repository.list()).toHaveLength(1)
    expect(service.getDetail(playlist.id)?.tracks.map((track) => track.id)).toEqual([2])
    service.updateRecentFrequentDays(playlist.id, 15)
    expect(service.getDetail(playlist.id)?.tracks.map((track) => track.id)).toEqual([1, 2])
    expect(service.updateRecentFrequentDays(999, 7)).toBeNull()
    const regular = service.create('Rock', {
      conditions: [{ field: 'genre', value: 'Rock' }],
    }).playlist
    expect(() => service.updateRecentFrequentDays(regular.id, 7)).toThrow(/仅最近常听/)
    expect(() => service.updateRecentFrequentDays(playlist.id, 0)).toThrow(/正整数/)
  })

  it('compares actual timestamps across offsets and keeps equal scores in a stable order', () => {
    plays(1, '2026-10-02', 2, '2026-10-02T12:00:00+08:00')
    plays(2, '2026-10-02', 2, '2026-10-02T05:00:00Z')
    plays(3, '2026-10-02', 2, '2026-10-02T05:00:00Z')
    const playlist = service.createRecentFrequent(3).playlist
    expect(service.getDetail(playlist.id)?.tracks.map((track) => track.id)).toEqual([2, 3, 1])
  })

  it('observes new playback immediately and rolls the date window at midnight', () => {
    plays(1, '2026-09-30', 10)
    plays(2, '2026-10-02', 1)
    const playlist = service.createRecentFrequent(3).playlist
    expect(service.getDetail(playlist.id)?.tracks.map((track) => track.id)).toEqual([1, 2])
    db.exec('UPDATE daily_track_play_stats SET play_count = 20 WHERE track_id = 2')
    expect(service.getDetail(playlist.id)?.tracks.map((track) => track.id)).toEqual([2, 1])
    vi.setSystemTime(new Date(2026, 9, 3, 0))
    expect(service.getDetail(playlist.id)?.tracks.map((track) => track.id)).toEqual([2])
    expect(service.listTrackCounts()).toEqual([{ playlistId: playlist.id, trackCount: 1 }])
  })
})
