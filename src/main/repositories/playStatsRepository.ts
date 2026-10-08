import type Database from 'better-sqlite3'
import { BaseRepository } from './baseRepository'

export class PlayStatsRepository extends BaseRepository {
  constructor(db: Database.Database) {
    super(db)
  }

  trackExists(trackId: number): boolean {
    const row = this.db.prepare('SELECT 1 AS ok FROM tracks WHERE id = ?').get(trackId) as
      | { ok: number }
      | undefined
    return row !== undefined
  }

  incrementPlayCount(trackId: number, playedAtIso: string, localPlayDate: string): void {
    const incrementTrack = this.db.prepare(`
      INSERT INTO track_play_stats (track_id, play_count, last_played_at, updated_at)
      VALUES (?, 1, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(track_id) DO UPDATE SET
        play_count = play_count + 1,
        last_played_at = excluded.last_played_at,
        updated_at = CURRENT_TIMESTAMP
    `)

    const incrementDay = this.db.prepare(`
      INSERT INTO daily_play_stats (play_date, play_count, duration_seconds, updated_at)
      SELECT ?, 1, COALESCE(duration_seconds, 0), CURRENT_TIMESTAMP
      FROM tracks
      WHERE id = ?
      ON CONFLICT(play_date) DO UPDATE SET
        play_count = play_count + 1,
        duration_seconds = duration_seconds + excluded.duration_seconds,
        updated_at = CURRENT_TIMESTAMP
    `)

    const incrementDailyTrack = this.db.prepare(`
      INSERT INTO daily_track_play_stats (
        play_date,
        track_id,
        play_count,
        duration_seconds,
        last_played_at,
        updated_at
      )
      SELECT ?, id, 1, COALESCE(duration_seconds, 0), ?, CURRENT_TIMESTAMP
      FROM tracks
      WHERE id = ?
      ON CONFLICT(play_date, track_id) DO UPDATE SET
        play_count = play_count + 1,
        duration_seconds = duration_seconds + excluded.duration_seconds,
        last_played_at = excluded.last_played_at,
        updated_at = CURRENT_TIMESTAMP
    `)

    this.db.transaction(() => {
      incrementTrack.run(trackId, playedAtIso)
      incrementDay.run(localPlayDate, trackId)
      incrementDailyTrack.run(localPlayDate, playedAtIso, trackId)
    })()
  }

  resetAll(): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM daily_track_play_stats').run()
      this.db.prepare('DELETE FROM daily_play_stats').run()
      this.db.prepare('DELETE FROM track_play_stats').run()
      this.db.prepare('DELETE FROM removed_daily_track_play_stats').run()
      this.db.prepare('UPDATE removed_track_history SET play_count=0,last_played_at=NULL').run()
    })()
  }
}
