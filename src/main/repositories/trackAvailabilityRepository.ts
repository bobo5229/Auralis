import type { ScannedTrack } from '@shared/types/libraryScan'
import type { NormalizedIdentity } from '@main/features/metadata/metadataNormalizer'
import type { MissingTrackCandidate } from './trackRepositoryTypes'
import { toRootPrefixes, toPathVariants, escapeLikePattern } from './trackRepositoryPaths'
import { BaseRepository } from './baseRepository'

export class TrackAvailabilityRepository extends BaseRepository {
  markMissingByFilePaths(filePaths: string[]): number[] {
    if (filePaths.length === 0) return []

    const markedIds: number[] = []

    for (let index = 0; index < filePaths.length; index += 400) {
      const batch = filePaths.slice(index, index + 400)
      const placeholders = batch.map(() => '?').join(', ')
      const rows = this.db
        .prepare(
          `UPDATE tracks
           SET availability = 'missing',
               missing_since = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE file_path IN (${placeholders})
             AND availability = 'available'
           RETURNING id`,
        )
        .all(...batch) as Array<{ id: number }>

      markedIds.push(...rows.map((row) => row.id))
    }

    return markedIds
  }

  markAvailableByFilePaths(filePaths: string[]): number[] {
    if (filePaths.length === 0) return []

    const restoredIds: number[] = []

    for (let index = 0; index < filePaths.length; index += 400) {
      const batch = filePaths.slice(index, index + 400)
      const placeholders = batch.map(() => '?').join(', ')
      const rows = this.db
        .prepare(
          `UPDATE tracks
           SET availability = 'available',
               missing_since = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE file_path IN (${placeholders})
             AND availability = 'missing'
           RETURNING id`,
        )
        .all(...batch) as Array<{ id: number }>

      restoredIds.push(...rows.map((row) => row.id))
    }

    return restoredIds
  }

  getMissingCandidates(): MissingTrackCandidate[] {
    return this.db
      .prepare(
        `SELECT id AS trackId,
                file_path AS filePath,
                title,
                artist,
                album,
                duration_seconds AS durationSeconds,
                file_size AS fileSize,
                isrc,
                metadata_signature AS metadataSignature,
                missing_since AS missingSince
         FROM tracks
         WHERE availability = 'missing'
         ORDER BY missing_since ASC`,
      )
      .all() as MissingTrackCandidate[]
  }

  findRelocationCandidatesByIdentity(
    identity: NormalizedIdentity,
    includeAvailable = false,
  ): MissingTrackCandidate[] {
    const selectCandidates = `
      SELECT id AS trackId,
             file_path AS filePath,
             title,
             artist,
             album,
             duration_seconds AS durationSeconds,
             file_size AS fileSize,
             isrc,
             metadata_signature AS metadataSignature,
             missing_since AS missingSince
      FROM tracks
      WHERE availability IN (${includeAvailable ? "'missing', 'available'" : "'missing'"})
    `

    if (identity.isrc) {
      const byIsrc = this.db
        .prepare(`${selectCandidates} AND isrc = ?`)
        .all(identity.isrc) as MissingTrackCandidate[]

      // Unique/ambiguous ISRC handling is done by the matcher.
      // Only fall through to title+artist when ISRC yields zero hits.
      if (byIsrc.length > 0) {
        return byIsrc
      }
    }

    return this.db
      .prepare(
        `${selectCandidates}
           AND isrc IS NULL
           AND title = ?
           AND artist = ?`,
      )
      .all(identity.title, identity.artist) as MissingTrackCandidate[]
  }

  markMissingUnderRootExcept(
    rootPath: string,
    foundFilePaths: string[],
    unreadableDirectoryPaths: string[] = [],
  ): number[] {
    const rootPrefixes = toRootPrefixes(rootPath)
    const rootPredicates = rootPrefixes.map(() => `file_path LIKE ? ESCAPE '~'`).join(' OR ')
    const rootPatternArgs = rootPrefixes.map((prefix) => `${escapeLikePattern(prefix)}%`)
    const unreadablePrefixes = unreadableDirectoryPaths.flatMap(toRootPrefixes)
    const unreadablePredicate =
      unreadablePrefixes.length > 0
        ? `AND NOT (${unreadablePrefixes.map(() => `file_path LIKE ? ESCAPE '~'`).join(' OR ')})`
        : ''
    const unreadablePatternArgs = unreadablePrefixes.map(
      (prefix) => `${escapeLikePattern(prefix)}%`,
    )

    if (foundFilePaths.length === 0) {
      const rows = this.db
        .prepare(
          `UPDATE tracks
           SET availability = 'missing',
               missing_since = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
            WHERE (${rootPredicates})
              AND availability = 'available'
              ${unreadablePredicate}
            RETURNING id`,
        )
        .all(...rootPatternArgs, ...unreadablePatternArgs) as Array<{ id: number }>

      return rows.map((row) => row.id)
    }

    try {
      this.db.exec(
        `CREATE TEMP TABLE IF NOT EXISTS _temp_found_paths (
          file_path TEXT PRIMARY KEY
        )`,
      )
      this.db.exec('DELETE FROM _temp_found_paths')

      const insertTemp = this.db.prepare(
        'INSERT OR IGNORE INTO _temp_found_paths (file_path) VALUES (?)',
      )
      const insertBatch = this.db.transaction((paths: string[]) => {
        for (const path of paths) {
          for (const pathVariant of toPathVariants(path)) {
            insertTemp.run(pathVariant)
          }
        }
      })

      for (let index = 0; index < foundFilePaths.length; index += 300) {
        insertBatch(foundFilePaths.slice(index, index + 300))
      }

      const rows = this.db
        .prepare(
          `UPDATE tracks
           SET availability = 'missing',
               missing_since = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
            WHERE (${rootPredicates})
              AND availability = 'available'
              AND file_path NOT IN (SELECT file_path FROM _temp_found_paths)
              ${unreadablePredicate}
            RETURNING id`,
        )
        .all(...rootPatternArgs, ...unreadablePatternArgs) as Array<{ id: number }>

      return rows.map((row) => row.id)
    } finally {
      this.db.exec('DROP TABLE IF EXISTS _temp_found_paths')
    }
  }

  /**
   * Relocate a record whose old file was confirmed absent (or a Windows path alias).
   * The expected old path prevents a stale match from taking over an already moved record.
   * Returns false when the target path is already occupied by another track
   * (or a UNIQUE constraint race loses), so callers can fall back to upsert.
   */
  relocateTrack(trackId: number, scannedTrack: ScannedTrack, expectedOldPath: string): boolean {
    const occupant = this.db
      .prepare(`SELECT id FROM tracks WHERE file_path = ? AND id != ?`)
      .get(scannedTrack.filePath, trackId) as { id: number } | undefined

    if (occupant) {
      return false
    }

    try {
      const result = this.db
        .prepare(
          `UPDATE tracks
           SET file_path = ?,
               file_size = ?,
               file_mtime_ms = ?,
               title = ?,
               artist = ?,
               album = ?,
               album_artist = ?,
               track_no = ?,
               disc_no = ?,
               duration_seconds = ?,
               year = ?,
               release_date = ?,
               copyright = ?,
               composer = ?,
               genre = ?,
               lyrics_text = ?,
               lyrics_format = ?,
               isrc = ?,
               metadata_signature = ?,
               availability = 'available',
               missing_since = NULL,
               lyrics_checked_mtime_ms = ?,
               lyrics_sidecar_fingerprint = ?,
               metadata_checked_mtime_ms = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND file_path = ?`,
        )
        .run(
          scannedTrack.filePath,
          scannedTrack.fileSize,
          scannedTrack.fileMtimeMs,
          scannedTrack.title,
          scannedTrack.artist,
          scannedTrack.album,
          scannedTrack.albumArtist,
          scannedTrack.trackNo,
          scannedTrack.discNo,
          scannedTrack.durationSeconds,
          scannedTrack.year,
          scannedTrack.releaseDate,
          scannedTrack.copyright,
          scannedTrack.composer,
          scannedTrack.genre,
          scannedTrack.lyricsText,
          scannedTrack.lyricsFormat,
          scannedTrack.isrc,
          scannedTrack.metadataSignature,
          scannedTrack.fileMtimeMs,
          scannedTrack.lyricsSidecarFingerprint ?? null,
          scannedTrack.fileMtimeMs,
          trackId,
          expectedOldPath,
        )

      return result.changes > 0
    } catch (error) {
      // SQLITE_CONSTRAINT (UNIQUE file_path) or other write races.
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code)
          : ''
      if (code.startsWith('SQLITE_CONSTRAINT')) {
        return false
      }

      throw error
    }
  }

  markMissingByPathPrefix(rootPath: string): number {
    const rootPrefixes = toRootPrefixes(rootPath)
    const predicates = rootPrefixes.map(() => `file_path LIKE ? ESCAPE '~'`).join(' OR ')
    const patternArgs = rootPrefixes.map((prefix) => `${escapeLikePattern(prefix)}%`)

    return this.db
      .prepare(
        `UPDATE tracks
         SET availability = 'missing',
             missing_since = COALESCE(missing_since, CURRENT_TIMESTAMP),
             updated_at = CURRENT_TIMESTAMP
         WHERE availability = 'available'
           AND (${predicates})`,
      )
      .run(...patternArgs).changes
  }
}
