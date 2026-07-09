import type Database from 'better-sqlite3'
import { BaseRepository } from './baseRepository'
import type {
  AnnualListeningInsights,
  DailyListeningDetail,
  DailyTopTrack,
  ListeningRankingItem,
  ListeningHeatmapDay,
} from '@shared/types/archive'

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

  getListeningHeatmap(year: number): {
    firstRecordedYear: number | null
    days: ListeningHeatmapDay[]
  } {
    const startDate = `${year}-01-01`
    const endDate = `${year}-12-31`
    const days = this.db
      .prepare(
        `SELECT
           play_date AS date,
           play_count AS playCount,
           duration_seconds AS durationSeconds
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

  getDailyListeningDetail(date: string): DailyListeningDetail {
    const summary = this.db
      .prepare(
        `SELECT
           play_count AS totalPlayCount,
           duration_seconds AS totalDurationSeconds
         FROM daily_play_stats
         WHERE play_date = ?`,
      )
      .get(date) as { totalPlayCount: number; totalDurationSeconds: number } | undefined

    const tracks = this.db
      .prepare(
        `SELECT
           stats.track_id AS trackId,
           display.title,
           display.artist,
           display.album,
           display.artwork_cache_key AS artworkCacheKey,
           stats.play_count AS playCount,
           stats.duration_seconds AS durationSeconds
         FROM daily_track_play_stats stats
         JOIN library_track_display display ON display.id = stats.track_id
         WHERE stats.play_date = ?
         ORDER BY stats.play_count DESC, stats.last_played_at DESC
         LIMIT 10`,
      )
      .all(date) as DailyTopTrack[]

    return {
      date,
      totalPlayCount: summary?.totalPlayCount ?? 0,
      totalDurationSeconds: summary?.totalDurationSeconds ?? 0,
      tracks,
    }
  }

  getAnnualListeningInsights(year: number): AnnualListeningInsights {
    const startDate = `${year}-01-01`
    const endDate = `${year}-12-31`
    const topTrack = this.db
      .prepare(
        `SELECT
           stats.track_id AS trackId,
           display.title,
           display.artist,
           display.album,
           display.artwork_cache_key AS artworkCacheKey,
           SUM(stats.play_count) AS playCount,
           SUM(stats.duration_seconds) AS durationSeconds
         FROM daily_track_play_stats stats
         JOIN library_track_display display ON display.id = stats.track_id
         WHERE stats.play_date BETWEEN ? AND ?
         GROUP BY stats.track_id
         ORDER BY playCount DESC, MAX(stats.last_played_at) DESC
         LIMIT 1`,
      )
      .get(startDate, endDate) as DailyTopTrack | undefined

    const peakDay = this.db
      .prepare(
        `SELECT play_date AS date
         FROM daily_play_stats
         WHERE play_date BETWEEN ? AND ?
         ORDER BY play_count DESC, play_date ASC
         LIMIT 1`,
      )
      .get(startDate, endDate) as { date: string } | undefined

    if (!peakDay) {
      return { year, topTrack: topTrack ?? null, peakDay: null }
    }

    const uniqueTrackCount = this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM daily_track_play_stats
         WHERE play_date = ?`,
      )
      .get(peakDay.date) as { count: number }
    const topTracks = this.db
      .prepare(
        `SELECT
           stats.track_id AS trackId,
           display.title,
           display.artist,
           display.album,
           display.artwork_cache_key AS artworkCacheKey,
           stats.play_count AS playCount,
           stats.duration_seconds AS durationSeconds
         FROM daily_track_play_stats stats
         JOIN library_track_display display ON display.id = stats.track_id
         WHERE stats.play_date = ?
         ORDER BY stats.play_count DESC, stats.last_played_at DESC
         LIMIT 3`,
      )
      .all(peakDay.date) as DailyTopTrack[]

    return {
      year,
      topTrack: topTrack ?? null,
      peakDay: {
        date: peakDay.date,
        uniqueTrackCount: uniqueTrackCount.count,
        topTracks,
      },
    }
  }

  getListeningRanking(
    startDate: string,
    endDate: string,
    target: 'track' | 'album',
  ): ListeningRankingItem[] {
    if (target === 'album') {
      return this.db
        .prepare(
          `SELECT
             COALESCE(NULLIF(display.album, ''), '未知专辑') || '::' ||
               COALESCE(NULLIF(display.album_artist, ''), NULLIF(display.artist, ''), '未知艺术家')
               AS key,
             COALESCE(NULLIF(display.album, ''), '未知专辑') AS title,
             COALESCE(NULLIF(display.album_artist, ''), NULLIF(display.artist, ''), '未知艺术家')
               AS artist,
             MAX(display.artwork_cache_key) AS artworkCacheKey,
             SUM(stats.play_count) AS playCount,
             SUM(stats.duration_seconds) AS durationSeconds
           FROM daily_track_play_stats stats
           JOIN library_track_display display ON display.id = stats.track_id
           WHERE stats.play_date BETWEEN ? AND ?
           GROUP BY
             COALESCE(NULLIF(display.album, ''), '未知专辑'),
             COALESCE(NULLIF(display.album_artist, ''), NULLIF(display.artist, ''), '未知艺术家')
           ORDER BY playCount DESC, MAX(stats.last_played_at) DESC
           LIMIT 50`,
        )
        .all(startDate, endDate) as ListeningRankingItem[]
    }

    return this.db
      .prepare(
        `SELECT
           CAST(stats.track_id AS TEXT) AS key,
           display.title,
           display.artist,
           display.artwork_cache_key AS artworkCacheKey,
           SUM(stats.play_count) AS playCount,
           SUM(stats.duration_seconds) AS durationSeconds
         FROM daily_track_play_stats stats
         JOIN library_track_display display ON display.id = stats.track_id
         WHERE stats.play_date BETWEEN ? AND ?
         GROUP BY stats.track_id
         ORDER BY playCount DESC, MAX(stats.last_played_at) DESC
         LIMIT 50`,
      )
      .all(startDate, endDate) as ListeningRankingItem[]
  }

  resetAll(): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM daily_track_play_stats').run()
      this.db.prepare('DELETE FROM daily_play_stats').run()
      this.db.prepare('DELETE FROM track_play_stats').run()
    })()
  }
}
