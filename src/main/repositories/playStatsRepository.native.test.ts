import { createRequire } from 'node:module'
import type Database from 'better-sqlite3'
import { expect, it } from 'vitest'
import { migrateDatabase } from '../database/schema'
import { PlayStatsService } from '../services/playStatsService'
import { PlayStatsRepository } from './playStatsRepository'
import { SmartPlaylistRepository } from './smartPlaylistRepository'

const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3') as typeof Database

it('keeps effective-play recording and statistics-backed smart playlist ordering', () => {
  const db = new DatabaseCtor(':memory:')
  try {
    migrateDatabase(db)
    db.exec(`INSERT INTO tracks(id,file_path,title,duration_seconds) VALUES
      (1,'one.flac','One',180),(2,'two.flac','Two',240)`)
    const service = new PlayStatsService(new PlayStatsRepository(db))
    const record = (trackId: number, sessionId: string, day: number) =>
      service.recordEffectivePlay({
        trackId,
        sessionId,
        playedAtIso: new Date(2026, 9, day, 12).toISOString(),
      })
    expect(record(1, 'first', 8)).toEqual({ ok: true, recorded: true })
    expect(record(1, 'first', 8)).toEqual({ ok: true, recorded: false })
    expect(record(1, 'second', 8)).toEqual({ ok: true, recorded: true })
    expect(record(2, 'third', 7)).toEqual({ ok: true, recorded: true })
    expect(
      db.prepare('SELECT track_id,play_count FROM track_play_stats ORDER BY track_id').all(),
    ).toEqual([
      { track_id: 1, play_count: 2 },
      { track_id: 2, play_count: 1 },
    ])
    const days = [
      { play_date: '2026-10-07', play_count: 1, duration_seconds: 240 },
      { play_date: '2026-10-08', play_count: 2, duration_seconds: 360 },
    ]
    expect(
      db
        .prepare(
          'SELECT play_date,play_count,duration_seconds FROM daily_play_stats ORDER BY play_date',
        )
        .all(),
    ).toEqual(days)
    expect(
      db
        .prepare(
          'SELECT play_date,play_count,duration_seconds FROM daily_track_play_stats ORDER BY play_date',
        )
        .all(),
    ).toEqual(days)
    const smartPlaylists = new SmartPlaylistRepository(db)
    expect(smartPlaylists.getMostListenedTrackIds()).toEqual([1, 2])
    expect(smartPlaylists.getRecentFrequentTrackIds('2026-10-07', '2026-10-08')).toEqual([1, 2])
    expect(smartPlaylists.getRecentPlayedTrackIds('2026-10-07', '2026-10-08')).toEqual([1, 2])
    expect(smartPlaylists.getRecentFrequentTrackIds('2026-10-08', '2026-10-08')).toEqual([1])
  } finally {
    db.close()
  }
})
