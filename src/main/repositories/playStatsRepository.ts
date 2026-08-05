import type Database from 'better-sqlite3'
import { BaseRepository } from './baseRepository'
import type {
  AnnualListeningInsights,
  DailyListeningDetail,
  DailyTopTrack,
  ListeningRankingItem,
  ListeningHeatmapDay,
} from '@shared/types/archive'
import { splitDelimitedValues } from '@shared/utils/delimitedValues'

/**
 * Atomic genre labels for spectrum / TopN.
 * Uses shared multi-value split so both `"; "` and `", "` (and full-width variants)
 * count as separators. Empty →「未分类」. Dedupes while preserving order.
 * Full play stats are attributed to every returned label.
 */
export function splitGenreLabels(raw: string | null | undefined): string[] {
  const parts = splitDelimitedValues(raw)
  if (parts.length === 0) return ['未分类']

  const seen = new Set<string>()
  const labels: string[] = []
  for (const part of parts) {
    if (seen.has(part)) continue
    seen.add(part)
    labels.push(part)
  }
  return labels
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

  /**
   * Genre label expression shared by spectrum aggregation and top-track queries.
   * Multi-genre tracks store comma-joined labels (see metadataNormalizer); split in JS.
   */
  private static readonly GENRE_LABEL_SQL = `COALESCE(NULLIF(TRIM(display.genre), ''), '未分类')`

  /**
   * Per-track yearly play totals with display metadata (one scan for spectrum + TopN).
   */
  private listYearTrackGenreStats(year: number): Array<{
    trackId: number
    title: string | null
    artist: string | null
    album: string | null
    artworkCacheKey: string | null
    genreRaw: string
    labels: string[]
    playCount: number
    durationSeconds: number
    lastPlayedAt: string | null
  }> {
    const startDate = `${year}-01-01`
    const endDate = `${year}-12-31`
    const genreExpr = PlayStatsRepository.GENRE_LABEL_SQL

    const rows = this.db
      .prepare(
        `SELECT
           stats.track_id AS trackId,
           display.title,
           display.artist,
           display.album,
           display.artwork_cache_key AS artworkCacheKey,
           ${genreExpr} AS genreRaw,
           SUM(stats.play_count) AS playCount,
           SUM(stats.duration_seconds) AS durationSeconds,
           MAX(stats.last_played_at) AS lastPlayedAt
         FROM daily_track_play_stats stats
         JOIN library_track_display display ON display.id = stats.track_id
         WHERE stats.play_date BETWEEN ? AND ?
         GROUP BY stats.track_id`,
      )
      .all(startDate, endDate) as Array<{
      trackId: number
      title: string | null
      artist: string | null
      album: string | null
      artworkCacheKey: string | null
      genreRaw: string
      playCount: number
      durationSeconds: number
      lastPlayedAt: string | null
    }>

    return rows.map((row) => ({
      trackId: Number(row.trackId),
      title: row.title,
      artist: row.artist,
      album: row.album,
      artworkCacheKey: row.artworkCacheKey,
      genreRaw: row.genreRaw,
      labels: splitGenreLabels(row.genreRaw),
      playCount: Number(row.playCount) || 0,
      durationSeconds: Number(row.durationSeconds) || 0,
      lastPlayedAt: row.lastPlayedAt,
    }))
  }

  /**
   * Aggregate genre spectrum for a calendar year from daily play stats.
   * Multi-genre tracks (e.g. "Jazz, Soul") contribute their full play_count and
   * duration_seconds to **each** atomic genre label.
   * Uses library_track_display.genre (COALESCE of track_metadata.genre_display and tracks.genre).
   */
  getListeningGenreSpectrum(year: number): {
    totalPlayedTracks: number
    totalDurationSeconds: number
    rows: Array<{ genre: string; count: number; durationSeconds: number }>
  } {
    const trackRows = this.listYearTrackGenreStats(year)

    const byGenre = new Map<string, { count: number; durationSeconds: number }>()
    let totalPlayedTracks = 0
    let totalDurationSeconds = 0

    for (const row of trackRows) {
      totalPlayedTracks += row.playCount
      totalDurationSeconds += row.durationSeconds
      for (const label of row.labels) {
        const prev = byGenre.get(label)
        if (prev) {
          prev.count += row.playCount
          prev.durationSeconds += row.durationSeconds
        } else {
          byGenre.set(label, { count: row.playCount, durationSeconds: row.durationSeconds })
        }
      }
    }

    const rows = [...byGenre.entries()]
      .map(([genre, stats]) => ({
        genre,
        count: stats.count,
        durationSeconds: stats.durationSeconds,
      }))
      .sort(
        (a, b) =>
          b.durationSeconds - a.durationSeconds ||
          b.count - a.count ||
          a.genre.localeCompare(b.genre, 'zh-CN'),
      )
      .slice(0, 10)

    return {
      // Real listening totals (not multi-genre expanded).
      totalPlayedTracks,
      totalDurationSeconds,
      rows,
    }
  }

  /**
   * Top tracks for one atomic genre in a calendar year (by play count).
   * A track matches if any split label equals `genre` (multi-genre full contribution).
   * Prefer {@link getGenreTopTracksForLabels} when building a full spectrum to avoid N scans.
   */
  getGenreTopTracks(year: number, genre: string, limit = 3): DailyTopTrack[] {
    return (
      this.getGenreTopTracksForLabels(this.listYearTrackGenreStats(year), [genre], limit).get(
        genre,
      ) ?? []
    )
  }

  /**
   * Batch Top-N tracks for multiple atomic genres from a single track-year scan.
   */
  getGenreTopTracksForLabels(
    trackRows: ReturnType<PlayStatsRepository['listYearTrackGenreStats']> | null,
    genres: string[],
    limit = 3,
    year?: number,
  ): Map<string, DailyTopTrack[]> {
    const tracks = trackRows ?? (year !== undefined ? this.listYearTrackGenreStats(year) : [])
    const wanted = new Set(genres)
    const buckets = new Map<string, Array<(typeof tracks)[number]>>()
    for (const genre of genres) {
      buckets.set(genre, [])
    }

    for (const row of tracks) {
      for (const label of row.labels) {
        if (!wanted.has(label)) continue
        buckets.get(label)!.push(row)
      }
    }

    const result = new Map<string, DailyTopTrack[]>()
    for (const genre of genres) {
      const list = buckets.get(genre) ?? []
      list.sort(
        (a, b) =>
          b.playCount - a.playCount ||
          String(b.lastPlayedAt ?? '').localeCompare(String(a.lastPlayedAt ?? '')),
      )
      result.set(
        genre,
        list.slice(0, limit).map((row) => ({
          trackId: row.trackId,
          title: row.title,
          artist: row.artist,
          album: row.album,
          artworkCacheKey: row.artworkCacheKey,
          playCount: row.playCount,
          durationSeconds: row.durationSeconds,
        })),
      )
    }
    return result
  }

  /**
   * Spectrum + nested Top3 in one track-year scan (multi-genre full contribution per label).
   */
  getListeningGenreSpectrumWithTopTracks(
    year: number,
    topTrackLimit = 3,
  ): {
    totalPlayedTracks: number
    totalDurationSeconds: number
    rows: Array<{
      genre: string
      count: number
      durationSeconds: number
      topTracks: DailyTopTrack[]
    }>
  } {
    const trackRows = this.listYearTrackGenreStats(year)

    const byGenre = new Map<string, { count: number; durationSeconds: number }>()
    let totalPlayedTracks = 0
    let totalDurationSeconds = 0

    for (const row of trackRows) {
      totalPlayedTracks += row.playCount
      totalDurationSeconds += row.durationSeconds
      for (const label of row.labels) {
        const prev = byGenre.get(label)
        if (prev) {
          prev.count += row.playCount
          prev.durationSeconds += row.durationSeconds
        } else {
          byGenre.set(label, { count: row.playCount, durationSeconds: row.durationSeconds })
        }
      }
    }

    const spectrumRows = [...byGenre.entries()]
      .map(([genre, stats]) => ({
        genre,
        count: stats.count,
        durationSeconds: stats.durationSeconds,
      }))
      .sort(
        (a, b) =>
          b.durationSeconds - a.durationSeconds ||
          b.count - a.count ||
          a.genre.localeCompare(b.genre, 'zh-CN'),
      )
      .slice(0, 10)

    const topByGenre = this.getGenreTopTracksForLabels(
      trackRows,
      spectrumRows.map((row) => row.genre),
      topTrackLimit,
    )

    return {
      totalPlayedTracks,
      totalDurationSeconds,
      rows: spectrumRows.map((row) => ({
        ...row,
        topTracks: topByGenre.get(row.genre) ?? [],
      })),
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
