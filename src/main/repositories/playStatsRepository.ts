import type Database from 'better-sqlite3'
import { BaseRepository } from './baseRepository'

export class PlayStatsRepository extends BaseRepository {
  constructor(db: Database.Database) {
    super(db)
  }

  incrementPlayCount(trackId: number, playedAtIso: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO track_play_stats (track_id, play_count, last_played_at, updated_at)
      VALUES (?, 1, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(track_id) DO UPDATE SET
        play_count = play_count + 1,
        last_played_at = excluded.last_played_at,
        updated_at = CURRENT_TIMESTAMP
    `)

    stmt.run(trackId, playedAtIso)
  }

  getStats(trackId: number): { playCount: number; lastPlayedAt: string | null } | null {
    const stmt = this.db.prepare(`
      SELECT play_count AS playCount, last_played_at AS lastPlayedAt
      FROM track_play_stats
      WHERE track_id = ?
    `)

    return stmt.get(trackId) as { playCount: number; lastPlayedAt: string | null } | null
  }
}
