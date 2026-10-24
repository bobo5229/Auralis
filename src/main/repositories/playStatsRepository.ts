import type Database from 'better-sqlite3'
import type { DailyPlayCount, DailyTopAlbum, DailyTopTrack } from '@shared/types/listeningArchive'
import { BaseRepository } from './baseRepository'
import type { AnnualListeningRow } from '@shared/types/annualListening'

/** Valid only for the synchronous duration of withAnnualListeningSnapshot. */
export interface AnnualListeningSnapshot {
  days: DailyPlayCount[]
  rows: Iterable<AnnualListeningRow>
  getDayTopAlbums(date: string): DailyTopAlbum[]
}

// Join each history source by the day's track IDs before combining them. Joining
// both UNION views materializes the entire library display on every daily query.
const dailyListeningTracks = `
  SELECT stats.track_id, stats.play_count, stats.duration_seconds,
         display.title, display.artist, display.album, display.album_artist,
         display.artwork_cache_key
  FROM daily_track_play_stats AS stats
  JOIN library_track_display AS display ON display.id = stats.track_id
  WHERE stats.play_date = @date AND stats.play_count > 0
  UNION ALL
  SELECT stats.track_id, stats.play_count, stats.duration_seconds,
         display.title, display.artist, display.album, display.album_artist,
         display.artwork_cache_key
  FROM removed_daily_track_play_stats AS stats
  JOIN removed_track_history AS display ON display.id = stats.track_id
  WHERE stats.play_date = @date AND stats.play_count > 0
`

function latestPlayedAt(previous: string | null | undefined, incoming: Date): string {
  const previousTime = previous ? Date.parse(previous) : NaN
  return new Date(
    Number.isNaN(previousTime) ? incoming.getTime() : Math.max(previousTime, incoming.getTime()),
  ).toISOString()
}

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
    const playedAt = new Date(playedAtIso)
    const readLastPlayed = this.db.prepare(`
      SELECT stats.last_played_at AS trackLastPlayedAt,
             daily.last_played_at AS dailyTrackLastPlayedAt
      FROM tracks
      LEFT JOIN track_play_stats AS stats ON stats.track_id = tracks.id
      LEFT JOIN daily_track_play_stats AS daily
        ON daily.track_id = tracks.id AND daily.play_date = ?
      WHERE tracks.id = ?
    `)
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
      // Compare inside the write transaction; legacy timestamps may use any Date.parse format.
      const previous = readLastPlayed.get(localPlayDate, trackId) as
        | { trackLastPlayedAt: string | null; dailyTrackLastPlayedAt: string | null }
        | undefined
      const trackPlayedAt = latestPlayedAt(previous?.trackLastPlayedAt, playedAt)
      const dailyTrackPlayedAt = latestPlayedAt(previous?.dailyTrackLastPlayedAt, playedAt)
      incrementTrack.run(trackId, trackPlayedAt)
      incrementDay.run(localPlayDate, trackId)
      incrementDailyTrack.run(localPlayDate, dailyTrackPlayedAt, trackId)
    })()
  }

  getAnnualPlayCounts(year: number): DailyPlayCount[] {
    return this.db
      .prepare(
        `SELECT play_date AS date, play_count AS playCount, duration_seconds AS durationSeconds
         FROM daily_play_stats
         WHERE play_date BETWEEN ? AND ?
         ORDER BY play_date`,
      )
      .all(`${year}-01-01`, `${year}-12-31`) as DailyPlayCount[]
  }

  getDayTopTracks(date: string): DailyTopTrack[] {
    return this.db
      .prepare(
        `
      WITH day_tracks AS (${dailyListeningTracks})
      SELECT track_id AS trackId, title, artist, play_count AS playCount
      FROM day_tracks
      ORDER BY play_count DESC, duration_seconds DESC, track_id ASC
      LIMIT 3
    `,
      )
      .all({ date }) as DailyTopTrack[]
  }

  withAnnualListeningSnapshot<T>(year: number, read: (snapshot: AnnualListeningSnapshot) => T): T {
    // Keep the lazy history iterator and all supplementary queries in one read snapshot.
    // Date predicates constrain both sources before joining display metadata.
    return this.db.transaction(() => {
      const rows = this.db
        .prepare(
          `
        WITH history AS (
          SELECT 'library' AS source, stats.track_id, stats.play_date, stats.play_count,
                 stats.duration_seconds AS recorded_duration, display.title, display.artist,
                 display.album, display.album_artist, display.artwork_cache_key,
                 display.duration_seconds, display.availability = 'available' AS available
          FROM daily_track_play_stats stats
          JOIN library_track_display display ON display.id = stats.track_id
          WHERE stats.play_date BETWEEN @start AND @end AND stats.play_count > 0
          UNION ALL
          SELECT 'removed', stats.track_id, stats.play_date, stats.play_count,
                 stats.duration_seconds, display.title, display.artist, display.album,
                 display.album_artist, display.artwork_cache_key, NULL, 0
          FROM removed_daily_track_play_stats stats
          JOIN removed_track_history display ON display.id = stats.track_id
          WHERE stats.play_date BETWEEN @start AND @end AND stats.play_count > 0
        )
        SELECT source, track_id AS trackId, CAST(substr(play_date, 6, 2) AS INTEGER) AS month,
               MIN(play_date) AS firstPlayedDate, title, artist, album, album_artist AS albumArtist,
               artwork_cache_key AS artworkCacheKey, duration_seconds AS durationSeconds,
               available, SUM(play_count) AS playCount, SUM(recorded_duration) AS recordedDuration
        FROM history GROUP BY source, track_id, month ORDER BY source, track_id, month
      `,
        )
        .iterate({
          start: `${year}-01-01`,
          end: `${year}-12-31`,
        }) as IterableIterator<AnnualListeningRow>
      return read({
        days: this.getAnnualPlayCounts(year),
        rows,
        getDayTopAlbums: (date) => this.getDayTopAlbums(date),
      })
    })()
  }

  getDayTopAlbums(date: string): DailyTopAlbum[] {
    return this.db
      .prepare(
        `
      WITH day_tracks AS (${dailyListeningTracks})
      SELECT
        album,
        COALESCE(
          NULLIF(TRIM(album_artist), ''),
          NULLIF(TRIM(artist), '')
        ) AS albumArtist,
        MAX(artwork_cache_key) AS artworkCacheKey,
        SUM(play_count) AS playCount,
        SUM(duration_seconds) AS durationSeconds,
        COUNT(*) AS trackCount
      FROM day_tracks
      WHERE album IS NOT NULL
        AND TRIM(album) <> ''
      GROUP BY
        album,
        COALESCE(
          NULLIF(TRIM(album_artist), ''),
          NULLIF(TRIM(artist), '')
        )
      ORDER BY durationSeconds DESC, playCount DESC, album COLLATE NOCASE ASC
      LIMIT 10
    `,
      )
      .all({ date }) as DailyTopAlbum[]
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
