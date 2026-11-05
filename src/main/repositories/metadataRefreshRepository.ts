import type Database from 'better-sqlite3'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { MetadataRefreshFailure } from '@shared/types/libraryScan'
import { BaseRepository } from './baseRepository'
import { MetadataTrackWriter } from './metadataTrackWriter'
import { captureArtworkAlbum, refreshArtworkAlbum } from './trackArtworkProjection'
import type {
  MetadataRefreshJob,
  TrackForMetadataRefresh,
  RefreshedTrackMetadata,
} from './metadataRefreshRepositoryTypes'

export type {
  MetadataRefreshJob,
  TrackForMetadataRefresh,
  RefreshedTrackMetadata,
} from './metadataRefreshRepositoryTypes'

function isUnderRoot(filePath: string, root: string): boolean {
  const path = resolve(filePath)
  const base = resolve(root)
  const rel = relative(
    process.platform === 'win32' ? base.toLowerCase() : base,
    process.platform === 'win32' ? path.toLowerCase() : path,
  )
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

function clampLimit(limit: number | undefined, fallback = 5000, max = 10000): number {
  if (limit === undefined || !Number.isFinite(limit) || !Number.isInteger(limit)) {
    return fallback
  }

  return Math.min(Math.max(limit, 1), max)
}

export class MetadataRefreshRepository extends BaseRepository {
  private readonly trackWriter: MetadataTrackWriter

  constructor(db: Database.Database) {
    super(db)
    this.trackWriter = new MetadataTrackWriter(db)
  }

  createJob(scope: string, totalTracks: number): number {
    const result = this.db
      .prepare(
        `INSERT INTO metadata_refresh_jobs (scope, status, total_tracks)
         VALUES (?, 'running', ?)`,
      )
      .run(scope, totalTracks)

    return Number(result.lastInsertRowid)
  }

  updateJobProgress(jobId: number, processed: number, failed: number): boolean {
    const result = this.db
      .prepare(
        `UPDATE metadata_refresh_jobs
         SET processed_tracks = ?, failed_tracks = ?
         WHERE id = ?
           AND status = 'running'`,
      )
      .run(processed, failed, jobId)

    return result.changes > 0
  }

  completeJob(jobId: number, errorMessage?: string): boolean {
    const result = this.db
      .prepare(
        `UPDATE metadata_refresh_jobs
         SET status = CASE WHEN ? IS NULL THEN 'completed' ELSE 'failed' END,
             finished_at = CURRENT_TIMESTAMP,
             error_message = ?
         WHERE id = ?
           AND status = 'running'`,
      )
      .run(errorMessage ?? null, errorMessage ?? null, jobId)

    return result.changes > 0
  }

  markInterruptedJobs(): void {
    this.db
      .prepare(
        `UPDATE metadata_refresh_jobs
         SET status = 'failed',
             finished_at = CURRENT_TIMESTAMP,
             error_message = 'Refresh interrupted by application shutdown'
         WHERE status = 'running'`,
      )
      .run()
  }

  addFailure(jobId: number, trackId: number | null, filePath: string, reason: string): void {
    this.db
      .prepare(
        `INSERT INTO metadata_refresh_failures (job_id, track_id, file_path, reason)
         VALUES (?, ?, ?, ?)`,
      )
      .run(jobId, trackId, filePath, reason)
  }

  listFailures(limit = 20): MetadataRefreshFailure[] {
    this.db
      .prepare(
        `DELETE FROM metadata_refresh_failures
         WHERE track_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1
             FROM tracks
             WHERE tracks.id = metadata_refresh_failures.track_id
               AND tracks.availability = 'available'
           )`,
      )
      .run()

    return this.db
      .prepare(
        `SELECT id,
                job_id AS jobId,
                track_id AS trackId,
                file_path AS filePath,
                reason,
                created_at AS createdAt
         FROM metadata_refresh_failures
         ORDER BY id DESC
         LIMIT ?`,
      )
      .all(Math.min(Math.max(limit, 1), 100)) as MetadataRefreshFailure[]
  }

  clearFailures(): number {
    return this.db.prepare('DELETE FROM metadata_refresh_failures').run().changes
  }

  markTrackMissing(trackId: number): void {
    this.db.transaction(() => {
      const album = captureArtworkAlbum(this.db, trackId)
      const result = this.db
        .prepare(
          `UPDATE tracks
           SET availability = 'missing',
               missing_since = COALESCE(missing_since, CURRENT_TIMESTAMP),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?
             AND availability = 'available'`,
        )
        .run(trackId)

      if (result.changes > 0 && album) refreshArtworkAlbum(this.db, album)

      this.db
        .prepare(
          `DELETE FROM metadata_refresh_failures
           WHERE track_id = ?`,
        )
        .run(trackId)
    })()
  }

  getTrackFilePath(trackId: number): string | null {
    const row = this.db
      .prepare(
        `SELECT file_path AS filePath
         FROM tracks
         WHERE id = ?
           AND availability = 'available'`,
      )
      .get(trackId) as { filePath: string } | undefined

    return row?.filePath ?? null
  }

  getActiveJob(): MetadataRefreshJob | null {
    return (
      (this.db
        .prepare(
          `SELECT id, scope, status,
      total_tracks AS totalTracks, processed_tracks AS processedTracks,
      failed_tracks AS failedTracks, started_at AS startedAt,
      finished_at AS finishedAt, error_message AS errorMessage
      FROM metadata_refresh_jobs WHERE status='running' ORDER BY id DESC LIMIT 1`,
        )
        .get() as MetadataRefreshJob | undefined) ?? null
    )
  }

  queueLegacyMetadataRecovery(): void {
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO pending_tag_recovery_refresh(track_id)
        SELECT track_id FROM track_metadata
        WHERE override_mask != 0 OR source IN ('user_edit', 'legacy_user_edit')`,
        )
        .run()
      this.db
        .prepare(
          `UPDATE tracks SET metadata_checked_mtime_ms = NULL
        WHERE id IN (SELECT track_id FROM track_metadata
          WHERE override_mask != 0 OR source IN ('user_edit', 'legacy_user_edit'))`,
        )
        .run()
    })()
  }

  queueTagRecoveryRefresh(trackIds: readonly number[]): void {
    const insert = this.db.prepare(
      'INSERT OR IGNORE INTO pending_tag_recovery_refresh(track_id) VALUES (?)',
    )
    this.db.transaction(() => {
      for (const trackId of trackIds) insert.run(trackId)
    })()
  }

  listPendingTagRecoveryPaths(): string[] {
    return this.db
      .prepare(
        'SELECT t.file_path FROM pending_tag_recovery_refresh p JOIN tracks t ON t.id = p.track_id',
      )
      .pluck()
      .all() as string[]
  }

  getJobById(jobId: number): MetadataRefreshJob | null {
    const row = this.db
      .prepare(
        `SELECT id, scope, status,
                total_tracks AS totalTracks,
                processed_tracks AS processedTracks,
                failed_tracks AS failedTracks,
                started_at AS startedAt,
                finished_at AS finishedAt,
                error_message AS errorMessage
         FROM metadata_refresh_jobs
         WHERE id = ?`,
      )
      .get(jobId) as MetadataRefreshJob | undefined

    return row ?? null
  }

  pruneLegacyLyricsJobs(): void {
    this.db.transaction(() => {
      this.db
        .prepare(
          `DELETE FROM metadata_refresh_failures WHERE job_id IN
        (SELECT id FROM metadata_refresh_jobs WHERE scope = 'legacy-lyrics' AND status != 'running')`,
        )
        .run()
      this.db
        .prepare(
          "DELETE FROM metadata_refresh_jobs WHERE scope = 'legacy-lyrics' AND status != 'running'",
        )
        .run()
    })()
  }

  private legacyLyricsRoots(): string[] {
    return (this.db.prepare('SELECT path FROM library_roots').all() as Array<{ path: string }>).map(
      (row) => row.path,
    )
  }

  getLegacyTtmlTracks(afterId: number, limit: number): TrackForMetadataRefresh[] {
    const roots = this.legacyLyricsRoots()
    if (!roots.length) return []
    const candidates = this.db
      .prepare(
        `SELECT id AS trackId, file_path AS filePath FROM tracks
      WHERE lyrics_format = 'ttml' AND id > ? ORDER BY id ASC`,
      )
      .iterate(afterId) as Iterable<TrackForMetadataRefresh>
    const result: TrackForMetadataRefresh[] = []
    for (const track of candidates) {
      if (roots.some((root) => isUnderRoot(track.filePath, root))) result.push(track)
      if (result.length >= clampLimit(limit)) break
    }
    return result
  }

  getLegacyTtmlFilePath(trackId: number): string | null {
    const row = this.db
      .prepare("SELECT file_path AS filePath FROM tracks WHERE id = ? AND lyrics_format = 'ttml'")
      .get(trackId) as { filePath: string } | undefined
    return row && this.legacyLyricsRoots().some((root) => isUnderRoot(row.filePath, root))
      ? row.filePath
      : null
  }

  updateLegacyTtmlLyrics(result: RefreshedTrackMetadata, fingerprint: string): boolean {
    return this.db.transaction(() => {
      if (this.getLegacyTtmlFilePath(result.trackId) !== result.sourceFilePath) return false
      const updated = this.db
        .prepare(
          `UPDATE tracks SET lyrics_text = ?, lyrics_format = ?,
        lyrics_checked_mtime_ms = ?, lyrics_sidecar_fingerprint = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND file_path = ? AND lyrics_format = 'ttml'`,
        )
        .run(
          result.lyricsText,
          result.lyricsFormat,
          result.fileMtimeMs,
          fingerprint,
          result.trackId,
          result.sourceFilePath,
        )
      if (!updated.changes) return false
      this.db
        .prepare(
          `UPDATE track_metadata SET lyrics_text = ?, lyrics_format = ?, refreshed_at = CURRENT_TIMESTAMP WHERE track_id = ?`,
        )
        .run(result.lyricsText, result.lyricsFormat, result.trackId)
      return true
    })()
  }

  getTracksWithMissingLyrics(limit: number): TrackForMetadataRefresh[] {
    return this.db
      .prepare(
        `SELECT id AS trackId, file_path AS filePath
         FROM tracks
         WHERE availability = 'available'
           AND lyrics_checked_mtime_ms IS NULL
         ORDER BY id ASC
         LIMIT ?`,
      )
      .all(clampLimit(limit)) as TrackForMetadataRefresh[]
  }

  getTracksByIds(trackIds: number[]): TrackForMetadataRefresh[] {
    const uniqueIds = [...new Set(trackIds)].filter(
      (trackId) => Number.isInteger(trackId) && trackId > 0,
    )

    if (uniqueIds.length === 0) {
      return []
    }

    const tracks: TrackForMetadataRefresh[] = []

    for (let index = 0; index < uniqueIds.length; index += 400) {
      const batch = uniqueIds.slice(index, index + 400)
      const placeholders = batch.map(() => '?').join(', ')

      tracks.push(
        ...(this.db
          .prepare(
            `SELECT id AS trackId, file_path AS filePath
             FROM tracks
             WHERE id IN (${placeholders})
               AND availability = 'available'
             ORDER BY id ASC`,
          )
          .all(...batch) as TrackForMetadataRefresh[]),
      )
    }

    return tracks
  }

  updateTrackMetadata(result: RefreshedTrackMetadata): void {
    this.db.transaction(() => {
      this.trackWriter.updateTrackMetadata(result)
    })()
  }

  updateTrackLyrics(result: RefreshedTrackMetadata): void {
    this.trackWriter.updateTrackLyrics(result)
  }
}
