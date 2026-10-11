import type Database from 'better-sqlite3'
import type { EditableTrackMetadata, MetadataRefreshFailure } from '@shared/types/libraryScan'
import { BaseRepository } from './baseRepository'
import { UserEditedMetadataWriter } from './userEditedMetadataWriter'
import { MetadataTrackWriter } from './metadataTrackWriter'
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
export { resolveArtworkKeyForUserEdit } from './userEditedMetadataWriter'

function clampLimit(limit: number | undefined, fallback = 5000, max = 10000): number {
  if (limit === undefined || !Number.isFinite(limit) || !Number.isInteger(limit)) {
    return fallback
  }

  return Math.min(Math.max(limit, 1), max)
}

export class MetadataRefreshRepository extends BaseRepository {
  private readonly userEditWriter: UserEditedMetadataWriter
  private readonly trackWriter: MetadataTrackWriter

  constructor(db: Database.Database) {
    super(db)
    this.userEditWriter = new UserEditedMetadataWriter(db)
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
    this.db
      .prepare(
        `UPDATE tracks
         SET availability = 'missing',
             missing_since = COALESCE(missing_since, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND availability = 'available'`,
      )
      .run(trackId)

    this.db
      .prepare(
        `DELETE FROM metadata_refresh_failures
         WHERE track_id = ?`,
      )
      .run(trackId)
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
         WHERE status = 'running'
         ORDER BY id DESC
         LIMIT 1`,
      )
      .get() as MetadataRefreshJob | undefined

    return row ?? null
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

  getEditableTrackMetadata(trackId: number): EditableTrackMetadata | null {
    return this.userEditWriter.getEditableTrackMetadata(trackId)
  }

  updateUserEditedMetadata(metadata: EditableTrackMetadata): void {
    this.userEditWriter.updateUserEditedMetadata(metadata)
  }

  updateTrackMetadata(result: RefreshedTrackMetadata): void {
    this.trackWriter.updateTrackMetadata(result)
  }

  updateTrackLyrics(result: RefreshedTrackMetadata): void {
    this.trackWriter.updateTrackLyrics(result)
  }

  commitVerifiedUserEdit(metadata: EditableTrackMetadata, result: RefreshedTrackMetadata): void {
    this.db.transaction(() => {
      if (metadata.trackId !== result.trackId) throw new Error('Metadata track identity changed')
      this.trackWriter.assertTrackIdentity(result)
      this.updateUserEditedMetadata(metadata)
      this.updateTrackMetadata(result)
    })()
  }
}
