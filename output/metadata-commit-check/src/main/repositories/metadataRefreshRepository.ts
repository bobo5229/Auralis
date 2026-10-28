import type Database from 'better-sqlite3'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { EditableTrackMetadata, MetadataRefreshFailure } from '@shared/types/libraryScan'
import { BaseRepository } from './baseRepository'
import { UserEditedMetadataWriter } from './userEditedMetadataWriter'
import { MetadataTrackWriter } from './metadataTrackWriter'
import type { FileTagValues } from '@shared/types/trackMetadata'
import { prepareFileMetadataProjection } from './fileMetadataProjection'
import { captureArtworkAlbum, refreshArtworkAlbum } from './trackArtworkProjection'
import { decodeScanFileFingerprint } from '@shared/utils/trackFileFingerprint'
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

  getEditableTrackMetadata(trackId: number): EditableTrackMetadata | null {
    return this.userEditWriter.getEditableTrackMetadata(trackId)
  }

  getMetadataEditRevision(trackId: number): string {
    return JSON.stringify(
      this.db
        .prepare(
          `SELECT t.file_path,t.title,t.artist,t.album,t.album_artist,t.genre,t.year,t.release_date,
      tm.title AS override_title,tm.artist_display,tm.album_title,tm.album_artist_display,tm.genre_display,
      tm.year AS override_year,tm.release_date AS override_date,tm.source,tm.override_mask
      FROM tracks t LEFT JOIN track_metadata tm ON tm.track_id=t.id WHERE t.id=?`,
        )
        .get(trackId) ?? null,
    )
  }

  getMetadataFileFingerprint(trackId: number) {
    return decodeScanFileFingerprint(
      this.db
        .prepare('SELECT file_stat_fingerprint FROM tracks WHERE id=?')
        .pluck()
        .get(trackId) as string | null,
    )
  }

  getLegacyMetadata(trackId: number): EditableTrackMetadata | null {
    const row = this.db
      .prepare(
        `SELECT 1 FROM track_metadata WHERE track_id=?
      AND (override_mask!=0 OR source IN ('user_edit','legacy_user_edit'))`,
      )
      .get(trackId)
    return row ? this.getEditableTrackMetadata(trackId) : null
  }

  adoptFileMetadata(
    trackId: number,
    path: string,
    tags: FileTagValues,
    expectedRevision: string,
  ): void {
    this.db.transaction(() => {
      const previous = captureArtworkAlbum(this.db, trackId)
      if (
        this.getMetadataEditRevision(trackId) !== expectedRevision ||
        this.getTrackFilePath(trackId) !== path
      )
        throw new Error('Metadata changed before adopting file values')
      this.db
        .prepare(`UPDATE track_metadata SET source='file_tag',override_mask=0 WHERE track_id=?`)
        .run(trackId)
      prepareFileMetadataProjection(this.db)(trackId, path, tags, {}, previous)
    })()
  }

  commitVerifiedFileEdit(result: RefreshedTrackMetadata): void {
    this.db.transaction(() => {
      this.trackWriter.assertTrackIdentity(result)
      const previous = captureArtworkAlbum(this.db, result.trackId)
      this.db
        .prepare(`UPDATE track_metadata SET source='file_tag',override_mask=0 WHERE track_id=?`)
        .run(result.trackId)
      this.updateTrackMetadata(result)
      if (previous) refreshArtworkAlbum(this.db, previous)
    })()
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
