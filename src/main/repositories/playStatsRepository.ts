import type Database from 'better-sqlite3'
import { BaseRepository } from './baseRepository'
import type { ListeningHeatmapDay } from '@shared/types/archive'

export class PlayStatsRepository extends BaseRepository {
  constructor(db: Database.Database) {
    super(db)
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
      INSERT INTO daily_play_stats (play_date, play_count, updated_at)
      VALUES (?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(play_date) DO UPDATE SET
        play_count = play_count + 1,
        updated_at = CURRENT_TIMESTAMP
    `)

    this.db.transaction(() => {
      incrementTrack.run(trackId, playedAtIso)
      incrementDay.run(localPlayDate)
    })()
  }

  getStats(trackId: number): { playCount: number; lastPlayedAt: string | null } | null {
    const stmt = this.db.prepare(`
      SELECT play_count AS playCount, last_played_at AS lastPlayedAt
      FROM track_play_stats
      WHERE track_id = ?
    `)

    return stmt.get(trackId) as { playCount: number; lastPlayedAt: string | null } | null
  }

  getListeningHeatmap(year: number): {
    firstRecordedYear: number | null
    days: ListeningHeatmapDay[]
  } {
    const startDate = `${year}-01-01`
    const endDate = `${year}-12-31`
    const days = this.db
      .prepare(
        `SELECT play_date AS date, play_count AS playCount
         FROM daily_play_stats
         WHERE play_date BETWEEN ? AND ?
         ORDER BY play_date ASC`,
      )
      .all(startDate, endDate) as ListeningHeatmapDay[]
    const firstDate = this.db
      .prepare('SELECT MIN(play_date) AS date FROM daily_play_stats')
      .get() as { date: string | null }

    return {
      firstRecordedYear: firstDate.date ? Number.parseInt(firstDate.date.slice(0, 4), 10) : null,
      days,
    }
  }
}
