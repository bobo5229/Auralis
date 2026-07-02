import { normalize } from 'node:path'
import type {
  AlbumArtworkPatch,
  ScannedTrack,
  TrackListItem,
  TrackLyricsPatch,
  TrackLyrics,
} from '@shared/types/libraryScan'
import type { PlaybackTrackDto } from '@shared/types/playback'
import type { NormalizedIdentity } from '@main/features/metadata/metadataNormalizer'
import { BaseRepository } from './baseRepository'

export interface KnownTrackFile {
  filePath: string
  fileSize: number | null
  fileMtimeMs: number | null
  album: string | null
  albumArtist: string | null
  artworkCacheKey: string | null
  lyricsFormat: string | null
  lyricsCheckedMtimeMs: number | null
  metadataCheckedMtimeMs: number | null
}

export interface MissingTrackCandidate {
  trackId: number
  filePath: string
  title: string | null
  artist: string | null
  album: string | null
  durationSeconds: number | null
  fileSize: number | null
  isrc: string | null
  metadataSignature: string | null
  missingSince: string | null
}

function toPathVariants(filePath: string): string[] {
  const normalizedPath = normalize(filePath)
  const slashPath = normalizedPath.replace(/\\/g, '/')
  const backslashPath = normalizedPath.replace(/\//g, '\\')

  return [...new Set([normalizedPath, slashPath, backslashPath])]
}

function toRootPrefixes(rootPath: string): string[] {
  return toPathVariants(rootPath).map((pathVariant) => {
    if (pathVariant.endsWith('/') || pathVariant.endsWith('\\')) {
      return pathVariant
    }

    return pathVariant.includes('/') && !pathVariant.includes('\\')
      ? `${pathVariant}/`
      : `${pathVariant}\\`
  })
}

function escapeLikePattern(value: string): string {
  return value.replace(/~/g, '~~').replace(/%/g, '~%').replace(/_/g, '~_')
}

export class TrackRepository extends BaseRepository {
  getFilePathById(trackId: number): string | null {
    const row = this.db
      .prepare(`SELECT file_path AS filePath FROM tracks WHERE id = ?`)
      .get(trackId) as { filePath: string } | undefined

    return row?.filePath ?? null
  }

  getTrackIdsByFilePaths(filePaths: string[]): number[] {
    const uniquePaths = [...new Set(filePaths)].filter(Boolean)

    if (uniquePaths.length === 0) {
      return []
    }

    const trackIds: number[] = []

    for (let index = 0; index < uniquePaths.length; index += 400) {
      const batch = uniquePaths.slice(index, index + 400)
      const placeholders = batch.map(() => '?').join(', ')
      const rows = this.db
        .prepare(`SELECT id FROM tracks WHERE file_path IN (${placeholders})`)
        .all(...batch) as Array<{ id: number }>

      trackIds.push(...rows.map((row) => row.id))
    }

    return trackIds
  }

  getExistingFilePaths(filePaths: string[]): Set<string> {
    const uniquePaths = [...new Set(filePaths)].filter(Boolean)

    if (uniquePaths.length === 0) {
      return new Set()
    }

    const existing = new Set<string>()

    for (let index = 0; index < uniquePaths.length; index += 400) {
      const batch = uniquePaths.slice(index, index + 400)
      const placeholders = batch.map(() => '?').join(', ')
      const rows = this.db
        .prepare(`SELECT file_path AS filePath FROM tracks WHERE file_path IN (${placeholders})`)
        .all(...batch) as Array<{ filePath: string }>

      for (const row of rows) {
        existing.add(row.filePath)
      }
    }

    return existing
  }

  getLyricsByTrackId(trackId: number): TrackLyrics | null {
    const row = this.db
      .prepare(
        `SELECT id AS trackId, lyrics_text AS lyricsText, lyrics_format AS lyricsFormat
         FROM tracks WHERE id = ?`,
      )
      .get(trackId) as TrackLyrics | undefined

    return row ?? null
  }

  getAll(): TrackListItem[] {
    return this.db
      .prepare(
        `SELECT id, title, artist, album,
                album_artist AS albumArtist,
                track_no AS trackNo,
                disc_no AS discNo,
                release_date AS releaseDate,
                copyright,
                duration_seconds AS durationSeconds,
                artwork_cache_key AS artworkCacheKey,
                genre,
                availability,
                play_count AS playCount,
                last_played_at AS lastPlayedAt
         FROM library_track_display
         WHERE availability = 'available'
         ORDER BY
           CASE WHEN album_artist IS NULL THEN 1 ELSE 0 END,
           album_artist COLLATE NOCASE ASC,
           CASE WHEN release_date IS NULL THEN 1 ELSE 0 END,
           release_date ASC,
           disc_no ASC,
           track_no ASC`,
      )
      .all() as TrackListItem[]
  }

  getKnownFiles(): KnownTrackFile[] {
    return this.db
      .prepare(
        `SELECT t.file_path AS filePath,
                t.file_size AS fileSize,
                t.file_mtime_ms AS fileMtimeMs,
                t.album AS album,
                t.album_artist AS albumArtist,
                a.artwork_cache_key AS artworkCacheKey,
                t.lyrics_format AS lyricsFormat,
                t.lyrics_checked_mtime_ms AS lyricsCheckedMtimeMs,
                t.metadata_checked_mtime_ms AS metadataCheckedMtimeMs
         FROM tracks t
         LEFT JOIN albums a ON t.album = a.title AND t.album_artist = a.artist`,
      )
      .all() as KnownTrackFile[]
  }

  upsertMany(tracks: ScannedTrack[]): void {
    if (tracks.length === 0) {
      return
    }

    const upsertTrack = this.db.prepare(`
      INSERT INTO tracks (
        file_path,
        file_size,
        file_mtime_ms,
        title,
        artist,
        album,
        album_artist,
        track_no,
        disc_no,
        duration_seconds,
        year,
        release_date,
        copyright,
        genre,
        lyrics_text,
        lyrics_format,
        lyrics_checked_mtime_ms,
        metadata_checked_mtime_ms,
        isrc,
        metadata_signature,
        availability,
        missing_since,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(file_path) DO UPDATE SET
        file_size = excluded.file_size,
        file_mtime_ms = excluded.file_mtime_ms,
        title = excluded.title,
        artist = excluded.artist,
        album = excluded.album,
        album_artist = excluded.album_artist,
        track_no = excluded.track_no,
        disc_no = excluded.disc_no,
        duration_seconds = excluded.duration_seconds,
        year = excluded.year,
        release_date = excluded.release_date,
        copyright = excluded.copyright,
        genre = excluded.genre,
        lyrics_text = excluded.lyrics_text,
        lyrics_format = excluded.lyrics_format,
        lyrics_checked_mtime_ms = excluded.lyrics_checked_mtime_ms,
        metadata_checked_mtime_ms = excluded.metadata_checked_mtime_ms,
        isrc = excluded.isrc,
        metadata_signature = excluded.metadata_signature,
        availability = 'available',
        missing_since = NULL,
        updated_at = CURRENT_TIMESTAMP
    `)

    const upsertAlbum = this.db.prepare(`
      INSERT INTO albums (title, artist, artwork_cache_key)
      VALUES (?, ?, ?)
      ON CONFLICT(title, artist) DO UPDATE SET
        artwork_cache_key = excluded.artwork_cache_key
        WHERE albums.artwork_cache_key IS NULL
          AND excluded.artwork_cache_key IS NOT NULL
    `)

    const upsertBatch = this.db.transaction((items: ScannedTrack[]) => {
      for (const track of items) {
        upsertTrack.run(
          track.filePath,
          track.fileSize,
          track.fileMtimeMs,
          track.title,
          track.artist,
          track.album,
          track.albumArtist,
          track.trackNo,
          track.discNo,
          track.durationSeconds,
          track.year,
          track.releaseDate,
          track.copyright,
          track.genre,
          track.lyricsText,
          track.lyricsFormat,
          track.fileMtimeMs,
          track.fileMtimeMs,
          track.isrc,
          track.metadataSignature,
        )
        upsertAlbum.run(track.album, track.albumArtist || track.artist, track.artworkCacheKey)
      }
    })

    for (let index = 0; index < tracks.length; index += 300) {
      upsertBatch(tracks.slice(index, index + 300))
    }
  }

  patchAlbumArtwork(items: AlbumArtworkPatch[]): void {
    if (items.length === 0) {
      return
    }

    const upsert = this.db.prepare(`
      INSERT INTO albums (title, artist, artwork_cache_key)
      VALUES (?, ?, ?)
      ON CONFLICT(title, artist) DO UPDATE SET
        artwork_cache_key = excluded.artwork_cache_key
        WHERE albums.artwork_cache_key IS NULL
          AND excluded.artwork_cache_key IS NOT NULL
    `)

    const batch = this.db.transaction((patches: AlbumArtworkPatch[]) => {
      for (const patch of patches) {
        upsert.run(patch.album, patch.artist, patch.artworkCacheKey)
      }
    })

    for (let index = 0; index < items.length; index += 300) {
      batch(items.slice(index, index + 300))
    }
  }

  patchLyrics(items: TrackLyricsPatch[]): void {
    if (items.length === 0) {
      return
    }

    const update = this.db.prepare(`
      UPDATE tracks
      SET lyrics_text = ?,
          lyrics_format = ?,
          lyrics_checked_mtime_ms = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE file_path = ?
    `)

    const batch = this.db.transaction((patches: TrackLyricsPatch[]) => {
      for (const patch of patches) {
        update.run(patch.lyricsText, patch.lyricsFormat, patch.lyricsCheckedMtimeMs, patch.filePath)
      }
    })

    for (let index = 0; index < items.length; index += 300) {
      batch(items.slice(index, index + 300))
    }
  }

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

  findMissingCandidatesByIdentity(identity: NormalizedIdentity): MissingTrackCandidate[] {
    if (identity.isrc) {
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
             AND isrc = ?`,
        )
        .all(identity.isrc) as MissingTrackCandidate[]
    }

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
           AND isrc IS NULL
           AND title = ?
           AND artist = ?`,
      )
      .all(identity.title, identity.artist) as MissingTrackCandidate[]
  }

  markMissingUnderRootExcept(rootPath: string, foundFilePaths: string[]): number[] {
    const rootPrefixes = toRootPrefixes(rootPath)
    const rootPredicates = rootPrefixes.map(() => `file_path LIKE ? ESCAPE '~'`).join(' OR ')
    const rootPatternArgs = rootPrefixes.map((prefix) => `${escapeLikePattern(prefix)}%`)

    if (foundFilePaths.length === 0) {
      const rows = this.db
        .prepare(
          `UPDATE tracks
           SET availability = 'missing',
               missing_since = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE (${rootPredicates})
             AND availability = 'available'
           RETURNING id`,
        )
        .all(...rootPatternArgs) as Array<{ id: number }>

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
           RETURNING id`,
        )
        .all(...rootPatternArgs) as Array<{ id: number }>

      return rows.map((row) => row.id)
    } finally {
      this.db.exec('DROP TABLE IF EXISTS _temp_found_paths')
    }
  }

  relocateTrack(trackId: number, scannedTrack: ScannedTrack): void {
    this.db
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
             genre = ?,
             lyrics_text = ?,
             lyrics_format = ?,
             isrc = ?,
             metadata_signature = ?,
             availability = 'available',
             missing_since = NULL,
             lyrics_checked_mtime_ms = ?,
             metadata_checked_mtime_ms = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
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
        scannedTrack.genre,
        scannedTrack.lyricsText,
        scannedTrack.lyricsFormat,
        scannedTrack.isrc,
        scannedTrack.metadataSignature,
        scannedTrack.fileMtimeMs,
        scannedTrack.fileMtimeMs,
        trackId,
      )
  }

  getRandomPlayableTrack(excludeTrackId?: number): PlaybackTrackDto | null {
    const baseQuery = `
      SELECT id, title, artist, album,
             album_artist AS albumArtist,
             duration_seconds AS durationSeconds,
             artwork_cache_key AS artworkCacheKey
      FROM library_track_display
      WHERE availability = 'available'`

    if (excludeTrackId !== undefined) {
      const row = this.db
        .prepare(`${baseQuery} AND id != ? ORDER BY RANDOM() LIMIT 1`)
        .get(excludeTrackId) as PlaybackTrackDto | undefined

      if (row) return row
    }

    const row = this.db.prepare(`${baseQuery} ORDER BY RANDOM() LIMIT 1`).get() as
      | PlaybackTrackDto
      | undefined

    return row ?? null
  }

  getRandomAlbumIdentity(excludeAlbumKey?: {
    albumArtist: string
    album: string
  }): { albumArtist: string; album: string } | null {
    const albumArtistExpr = `COALESCE(NULLIF(album_artist, ''), artist)`

    const baseQuery = `
      SELECT ${albumArtistExpr} AS albumArtist, album
      FROM library_track_display
      WHERE availability = 'available'
        AND album IS NOT NULL
        AND album != ''
      GROUP BY ${albumArtistExpr}, album`

    if (excludeAlbumKey) {
      const row = this.db
        .prepare(
          `${baseQuery} HAVING NOT (${albumArtistExpr} = ? AND album = ?) ORDER BY RANDOM() LIMIT 1`,
        )
        .get(excludeAlbumKey.albumArtist, excludeAlbumKey.album) as
        | { albumArtist: string; album: string }
        | undefined

      if (row) return row
    }

    const row = this.db.prepare(`${baseQuery} ORDER BY RANDOM() LIMIT 1`).get() as
      | { albumArtist: string; album: string }
      | undefined

    return row ?? null
  }

  getAlbumTracks(albumArtist: string, album: string): PlaybackTrackDto[] {
    const albumArtistExpr = `COALESCE(NULLIF(album_artist, ''), artist)`

    return this.db
      .prepare(
        `SELECT id, title, artist, album,
                ${albumArtistExpr} AS albumArtist,
                duration_seconds AS durationSeconds,
                artwork_cache_key AS artworkCacheKey
         FROM library_track_display
         WHERE availability = 'available'
           AND ${albumArtistExpr} = ?
           AND album = ?
         ORDER BY
           CASE WHEN disc_no IS NULL THEN 1 ELSE 0 END,
           disc_no ASC,
           CASE WHEN track_no IS NULL THEN 1 ELSE 0 END,
           track_no ASC,
           title COLLATE NOCASE ASC,
           id ASC`,
      )
      .all(albumArtist, album) as PlaybackTrackDto[]
  }
}
