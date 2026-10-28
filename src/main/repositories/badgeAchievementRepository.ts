import type Database from 'better-sqlite3'
import type {
  BadgeAchievements,
  ListeningProgressBatch,
  AlbumCompletionProgress,
} from '@shared/types/badgeAchievements'
import {
  mergeListeningIntervals,
  sampleDailySeconds,
  type ListeningInterval,
} from '../features/archive/listeningEvidence'

export class BadgeAchievementRepository {
  constructor(private readonly db: Database.Database) {}
  getEpoch(): number {
    return this.db
      .prepare('SELECT epoch FROM badge_listening_epoch WHERE id=1')
      .pluck()
      .get() as number
  }
  record(batch: ListeningProgressBatch): { ok: boolean; epoch: number } {
    return this.db.transaction(() => {
      const epoch = this.getEpoch()
      if (batch.epoch !== epoch) return { ok: false, epoch }
      const track = this.db
        .prepare('SELECT duration_seconds AS duration FROM tracks WHERE id=?')
        .get(batch.trackId) as { duration: number | null } | undefined
      if (!track) return { ok: false, epoch }
      const duration =
        track.duration && Number.isFinite(track.duration) && track.duration > 0
          ? track.duration
          : null
      const previous = this.db
        .prepare(
          'SELECT track_id AS trackId, sequence FROM badge_listening_sessions WHERE session_id=?',
        )
        .get(batch.sessionId) as { trackId: number; sequence: number } | undefined
      if (previous && previous.trackId !== batch.trackId) return { ok: false, epoch }
      if (previous && previous.sequence >= batch.sequence) return { ok: true, epoch }
      const samples = batch.samples
      if (
        samples.some(
          (s) =>
            s.startSeconds < 0 ||
            s.endSeconds <= s.startSeconds ||
            s.endSeconds - s.startSeconds > s.playedSeconds + 0.5,
        )
      )
        return { ok: false, epoch }
      const stored = this.db
        .prepare('SELECT intervals_json FROM badge_track_coverage WHERE track_id=?')
        .pluck()
        .get(batch.trackId) as string | undefined
      const intervals = mergeListeningIntervals([
        ...(stored ? (JSON.parse(stored) as ListeningInterval[]) : []),
        ...samples.map(
          (s) =>
            [s.startSeconds, Math.min(s.endSeconds, duration ?? Infinity)] as ListeningInterval,
        ),
      ])
      const covered = intervals.reduce((n, [a, b]) => n + b - a, 0)
      this.db
        .prepare(
          'INSERT INTO badge_track_coverage VALUES(?,?,?) ON CONFLICT(track_id) DO UPDATE SET intervals_json=excluded.intervals_json,covered_seconds=excluded.covered_seconds',
        )
        .run(batch.trackId, JSON.stringify(intervals), covered)
      const addDay = this.db.prepare(
        'INSERT INTO badge_listening_daily VALUES(?,?) ON CONFLICT(play_date) DO UPDATE SET seconds=seconds+excluded.seconds',
      )
      for (const sample of samples)
        for (const [day, seconds] of sampleDailySeconds(sample)) addDay.run(day, seconds)
      this.db
        .prepare(
          'INSERT INTO badge_listening_sessions VALUES(?,?,?) ON CONFLICT(session_id) DO UPDATE SET sequence=excluded.sequence',
        )
        .run(batch.sessionId, batch.trackId, batch.sequence)
      return { ok: true, epoch }
    })()
  }
  getAchievements(): BadgeAchievements {
    return this.db.transaction(() => {
      const time = this.db
        .prepare(
          `WITH days AS (
        SELECT play_date,SUM(seconds) AS seconds FROM (
          SELECT * FROM badge_legacy_daily UNION ALL SELECT * FROM badge_listening_daily
        ) GROUP BY play_date
      ) SELECT COALESCE(SUM(seconds),0) AS seconds, COALESCE(SUM(seconds >= 3600),0) AS days FROM days`,
        )
        .get() as { seconds: number; days: number }
      const albums = this.db
        .prepare(
          `SELECT COUNT(*) AS totalTracks,
        SUM(CASE WHEN t.duration_seconds > 0 AND COALESCE(c.covered_seconds,0) + 0.000001 >= t.duration_seconds * 0.9
          AND (SELECT COALESCE(SUM(MAX(0,MIN(json_extract(value,'$[1]'),t.duration_seconds)-json_extract(value,'$[0]'))),0)
            FROM json_each(COALESCE(c.intervals_json,'[]'))) + 0.000001 >= t.duration_seconds * 0.9 THEN 1 ELSE 0 END) AS completedTracks,
        MIN(instr(lower(COALESCE(t.genre,'')), 'live') > 0) AS live
        FROM library_track_display t LEFT JOIN badge_track_coverage c ON c.track_id=t.id
        WHERE NULLIF(TRIM(t.album),'') IS NOT NULL
        GROUP BY t.album, COALESCE(NULLIF(TRIM(t.album_artist),''),NULLIF(TRIM(t.artist),''),'Unknown Artist')`,
        )
        .iterate() as Iterable<AlbumCompletionProgress & { live: number }>
      let completeAlbums = 0,
        completeLiveAlbums = 0
      let albumProgress: AlbumCompletionProgress = { completedTracks: 0, totalTracks: 0 }
      let liveAlbumProgress: AlbumCompletionProgress = { completedTracks: 0, totalTracks: 0 }
      const better = (a: AlbumCompletionProgress, b: AlbumCompletionProgress) =>
        !b.totalTracks || a.completedTracks / a.totalTracks > b.completedTracks / b.totalTracks
      for (const album of albums) {
        const progress = { completedTracks: album.completedTracks, totalTracks: album.totalTracks }
        if (better(progress, albumProgress)) albumProgress = progress
        if (album.live && better(progress, liveAlbumProgress)) liveAlbumProgress = progress
        if (album.completedTracks === album.totalTracks) {
          completeAlbums++
          if (album.live) completeLiveAlbums++
        }
      }
      return {
        epoch: this.getEpoch(),
        listeningSeconds: time.seconds,
        listeningDays: time.days,
        completeAlbums,
        completeLiveAlbums,
        albumProgress,
        liveAlbumProgress,
      }
    })()
  }
}
