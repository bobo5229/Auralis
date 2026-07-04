import { BaseRepository } from './baseRepository'
import type Database from 'better-sqlite3'
import type { EditableTrackMetadata, MetadataRefreshFailure } from '@shared/types/libraryScan'

export interface MetadataRefreshJob {
  id: number
  scope: string
  status: string
  totalTracks: number
  processedTracks: number
  failedTracks: number
  startedAt: string
  finishedAt: string | null
  errorMessage: string | null
}

export interface TrackForMetadataRefresh {
  trackId: number
  filePath: string
}

export interface RefreshedTrackMetadata {
  trackId: number
  title: string
  artistDisplay: string
  artists: string[]
  artist: string
  albumTitle: string
  album: string
  albumArtistDisplay: string
  albumArtists: string[]
  albumArtist: string
  trackNo: number | null
  discNo: number | null
  durationSeconds: number | null
  year: number | null
  releaseDate: string | null
  copyright: string | null
  genres: string[]
  genre: string | null
  lyricsText: string | null
  lyricsFormat: string | null
  artworkCacheKey: string | null
  isrc: string | null
  metadataSignature: string
  rawCommonJson: string
  rawNativeJson: string | null
}

function clampLimit(limit: number | undefined, fallback = 5000, max = 10000): number {
  if (!Number.isFinite(limit) || !Number.isInteger(limit)) {
    return fallback
  }

  return Math.min(Math.max(limit, 1), max)
}

function normalizeEditableText(value: string | null): string | null {
  if (value === null) {
    return null
  }

  const normalized = value.trim()
  return normalized || null
}

function normalizeEditableYear(value: number | null): number | null {
  if (value === null) {
    return null
  }

  if (!Number.isInteger(value) || value < 0 || value > 9999) {
    throw new Error('Year must be a number from 0 to 9999')
  }

  return value
}

function normalizeEditableReleaseDate(value: string | null): string | null {
  const normalized = normalizeEditableText(value)

  if (!normalized) {
    return null
  }

  const match = normalized.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/)

  if (!match) {
    throw new Error('Release Date must use YYYY, YYYY-MM, or YYYY-MM-DD')
  }

  const month = match[2] ? Number.parseInt(match[2], 10) : null
  const day = match[3] ? Number.parseInt(match[3], 10) : null

  if (month !== null && (month < 1 || month > 12)) {
    throw new Error('Release Date month must be between 01 and 12')
  }

  if (day !== null && (day < 1 || day > 31)) {
    throw new Error('Release Date day must be between 01 and 31')
  }

  return normalized
}

function splitDisplayValues(value: string): string[] {
  return value
    .split(/\s*;\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
}

export class MetadataRefreshRepository extends BaseRepository {
  createJob(scope: string, totalTracks: number): number {
    const result = this.db
      .prepare(
        `INSERT INTO metadata_refresh_jobs (scope, status, total_tracks)
         VALUES (?, 'running', ?)`,
      )
      .run(scope, totalTracks)

    return Number(result.lastInsertRowid)
  }

  updateJobProgress(jobId: number, processed: number, failed: number): void {
    this.db
      .prepare(
        `UPDATE metadata_refresh_jobs
         SET processed_tracks = ?, failed_tracks = ?
         WHERE id = ?`,
      )
      .run(processed, failed, jobId)
  }

  completeJob(jobId: number, errorMessage?: string): void {
    this.db
      .prepare(
        `UPDATE metadata_refresh_jobs
         SET status = CASE WHEN ? IS NULL THEN 'completed' ELSE 'failed' END,
             finished_at = CURRENT_TIMESTAMP,
             error_message = ?
         WHERE id = ?`,
      )
      .run(errorMessage ?? null, errorMessage ?? null, jobId)
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

  getEditableTrackMetadata(trackId: number): EditableTrackMetadata | null {
    const row = this.db
      .prepare(
        `SELECT id AS trackId,
                title,
                artist AS artistDisplay,
                album AS albumTitle,
                album_artist AS albumArtistDisplay,
                genre AS genreDisplay,
                year,
                release_date AS releaseDate
         FROM library_track_display
         WHERE id = ?`,
      )
      .get(trackId) as EditableTrackMetadata | undefined

    return row ?? null
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

  updateUserEditedMetadata(metadata: EditableTrackMetadata): void {
    const update = this.db.transaction((item: EditableTrackMetadata) => {
      const existing = this.getEditableTrackMetadata(item.trackId)

      if (!existing) {
        throw new Error(`Track not found: ${item.trackId}`)
      }

      const title = normalizeEditableText(item.title)
      const artistDisplay = normalizeEditableText(item.artistDisplay)
      const albumTitle = normalizeEditableText(item.albumTitle)
      const albumArtistDisplay = normalizeEditableText(item.albumArtistDisplay)
      const genreDisplay = normalizeEditableText(item.genreDisplay)
      const releaseDate = normalizeEditableReleaseDate(item.releaseDate)
      const year = normalizeEditableYear(item.year)

      this.db
        .prepare(
          `INSERT INTO track_metadata (
            track_id,
            title,
            artist_display,
            album_title,
            album_artist_display,
            genre_display,
            year,
            release_date,
            source,
            refreshed_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'user_edit', CURRENT_TIMESTAMP)
          ON CONFLICT(track_id) DO UPDATE SET
            title = excluded.title,
            artist_display = excluded.artist_display,
            album_title = excluded.album_title,
            album_artist_display = excluded.album_artist_display,
            genre_display = excluded.genre_display,
            year = excluded.year,
            release_date = excluded.release_date,
            source = excluded.source,
            refreshed_at = CURRENT_TIMESTAMP`,
        )
        .run(
          item.trackId,
          title,
          artistDisplay,
          albumTitle,
          albumArtistDisplay,
          genreDisplay,
          year,
          releaseDate,
        )

      this.replaceTrackArtists(
        item.trackId,
        artistDisplay ? splitDisplayValues(artistDisplay) : [],
        'primary',
        this.db.prepare(`
          INSERT INTO artists (name)
          VALUES (?)
          ON CONFLICT(name) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
        `),
        this.db.prepare(`
          SELECT id
          FROM artists
          WHERE name = ?
        `),
        this.db.prepare(`
          DELETE FROM track_artists
          WHERE track_id = ?
            AND role = ?
        `),
        this.db.prepare(`
          INSERT OR IGNORE INTO track_artists (track_id, artist_id, position, role)
          VALUES (?, ?, ?, ?)
        `),
      )
      this.replaceTrackArtists(
        item.trackId,
        albumArtistDisplay ? splitDisplayValues(albumArtistDisplay) : [],
        'album_artist',
        this.db.prepare(`
          INSERT INTO artists (name)
          VALUES (?)
          ON CONFLICT(name) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
        `),
        this.db.prepare(`
          SELECT id
          FROM artists
          WHERE name = ?
        `),
        this.db.prepare(`
          DELETE FROM track_artists
          WHERE track_id = ?
            AND role = ?
        `),
        this.db.prepare(`
          INSERT OR IGNORE INTO track_artists (track_id, artist_id, position, role)
          VALUES (?, ?, ?, ?)
        `),
      )

      this.db
        .prepare(
          `UPDATE tracks
           SET title = ?,
               artist = ?,
               album = ?,
               album_artist = ?,
               year = ?,
               release_date = ?,
               genre = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .run(
          title,
          artistDisplay,
          albumTitle,
          albumArtistDisplay,
          year,
          releaseDate,
          genreDisplay,
          item.trackId,
        )
    })

    update(metadata)
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

  getTracksWithMissingMetadata(limit: number): TrackForMetadataRefresh[] {
    return this.db
      .prepare(
        `SELECT id AS trackId, file_path AS filePath
         FROM tracks
         WHERE metadata_checked_mtime_ms IS NULL
            OR lyrics_checked_mtime_ms IS NULL
            OR title IS NULL
            OR title = ''
            OR title = 'Unknown Title'
            OR artist IS NULL
            OR artist = ''
            OR artist = 'Unknown Artist'
            OR album IS NULL
            OR album = ''
            OR album = 'Unknown Album'
            OR album_artist IS NULL
            OR album_artist = ''
            OR album_artist = 'Unknown Artist'
            OR (
              lyrics_format = 'plain'
              AND lyrics_text IS NOT NULL
              AND (
                lower(file_path) LIKE '%.m4a'
                OR lower(file_path) LIKE '%.mp4'
                OR lower(file_path) LIKE '%.aac'
              )
            )
            OR (
              genre IS NULL
              AND (
                lower(file_path) LIKE '%.m4a'
                OR lower(file_path) LIKE '%.mp4'
                OR lower(file_path) LIKE '%.aac'
              )
            )
         ORDER BY id ASC
         LIMIT ?`,
      )
      .all(clampLimit(limit)) as TrackForMetadataRefresh[]
  }

  getTracksWithMissingLyrics(limit: number): TrackForMetadataRefresh[] {
    return this.db
      .prepare(
        `SELECT id AS trackId, file_path AS filePath
         FROM tracks
         WHERE lyrics_checked_mtime_ms IS NULL
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
             ORDER BY id ASC`,
          )
          .all(...batch) as TrackForMetadataRefresh[]),
      )
    }

    return tracks
  }

  updateTrackMetadata(result: RefreshedTrackMetadata): void {
    const upsertTrackMetadata = this.db.prepare(`
      INSERT INTO track_metadata (
        track_id,
        title,
        artist_display,
        album_title,
        album_artist_display,
        genre_display,
        year,
        release_date,
        lyrics_text,
        lyrics_format,
        artwork_cache_key,
        source,
        refreshed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'file_tag', CURRENT_TIMESTAMP)
      ON CONFLICT(track_id) DO UPDATE SET
        title = excluded.title,
        artist_display = excluded.artist_display,
        album_title = excluded.album_title,
        album_artist_display = excluded.album_artist_display,
        genre_display = excluded.genre_display,
        year = excluded.year,
        release_date = excluded.release_date,
        lyrics_text = excluded.lyrics_text,
        lyrics_format = excluded.lyrics_format,
        artwork_cache_key = excluded.artwork_cache_key,
        source = excluded.source,
        refreshed_at = CURRENT_TIMESTAMP
    `)

    const updateTrack = this.db.prepare(`
      UPDATE tracks
      SET title = ?,
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
          lyrics_checked_mtime_ms = file_mtime_ms,
          metadata_checked_mtime_ms = file_mtime_ms,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)

    const upsertAlbum = this.db.prepare(`
      INSERT INTO albums (title, artist, artwork_cache_key)
      VALUES (?, ?, ?)
      ON CONFLICT(title, artist) DO UPDATE SET
        artwork_cache_key = CASE
          WHEN albums.artwork_cache_key IS NULL AND excluded.artwork_cache_key IS NOT NULL
          THEN excluded.artwork_cache_key
          ELSE albums.artwork_cache_key
        END,
        updated_at = CURRENT_TIMESTAMP
    `)

    const upsertArtist = this.db.prepare(`
      INSERT INTO artists (name)
      VALUES (?)
      ON CONFLICT(name) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
    `)

    const getArtistId = this.db.prepare(`
      SELECT id
      FROM artists
      WHERE name = ?
    `)

    const deleteTrackArtists = this.db.prepare(`
      DELETE FROM track_artists
      WHERE track_id = ?
        AND role = ?
    `)

    const insertTrackArtist = this.db.prepare(`
      INSERT OR IGNORE INTO track_artists (track_id, artist_id, position, role)
      VALUES (?, ?, ?, ?)
    `)

    const insertSnapshot = this.db.prepare(`
      INSERT INTO file_tag_snapshots (
        track_id,
        file_size,
        file_mtime_ms,
        parser_name,
        raw_common_json,
        raw_native_json
      )
      SELECT id, file_size, file_mtime_ms, 'music-metadata', ?, ?
      FROM tracks
      WHERE id = ?
    `)

    const write = this.db.transaction((metadata: RefreshedTrackMetadata) => {
      const artistDisplay = metadata.artistDisplay || metadata.artist
      const albumTitle = metadata.albumTitle || metadata.album
      const albumArtistDisplay =
        metadata.albumArtistDisplay || metadata.albumArtist || artistDisplay
      const genreDisplay = metadata.genres.length > 0 ? metadata.genres.join(', ') : metadata.genre

      upsertTrackMetadata.run(
        metadata.trackId,
        metadata.title,
        artistDisplay,
        albumTitle,
        albumArtistDisplay,
        genreDisplay,
        metadata.year,
        metadata.releaseDate,
        metadata.lyricsText,
        metadata.lyricsFormat,
        metadata.artworkCacheKey,
      )

      updateTrack.run(
        metadata.title,
        artistDisplay,
        albumTitle,
        albumArtistDisplay,
        metadata.trackNo,
        metadata.discNo,
        metadata.durationSeconds,
        metadata.year,
        metadata.releaseDate,
        metadata.copyright,
        genreDisplay,
        metadata.lyricsText,
        metadata.lyricsFormat,
        metadata.isrc,
        metadata.metadataSignature,
        metadata.trackId,
      )

      upsertAlbum.run(albumTitle, albumArtistDisplay, metadata.artworkCacheKey)
      this.replaceTrackArtists(
        metadata.trackId,
        metadata.artists.length > 0 ? metadata.artists : [artistDisplay],
        'primary',
        upsertArtist,
        getArtistId,
        deleteTrackArtists,
        insertTrackArtist,
      )
      this.replaceTrackArtists(
        metadata.trackId,
        metadata.albumArtists.length > 0 ? metadata.albumArtists : [albumArtistDisplay],
        'album_artist',
        upsertArtist,
        getArtistId,
        deleteTrackArtists,
        insertTrackArtist,
      )
      insertSnapshot.run(metadata.rawCommonJson, metadata.rawNativeJson, metadata.trackId)
    })

    write(result)
  }

  updateTrackLyrics(trackId: number, lyricsText: string | null, lyricsFormat: string | null): void {
    this.db
      .prepare(
        `UPDATE tracks
         SET lyrics_text = ?,
             lyrics_format = ?,
             lyrics_checked_mtime_ms = file_mtime_ms,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .run(lyricsText, lyricsFormat, trackId)

    this.db
      .prepare(
        `UPDATE track_metadata
         SET lyrics_text = ?,
             lyrics_format = ?,
             refreshed_at = CURRENT_TIMESTAMP
         WHERE track_id = ?`,
      )
      .run(lyricsText, lyricsFormat, trackId)
  }

  private replaceTrackArtists(
    trackId: number,
    names: string[],
    role: string,
    upsertArtist: Database.Statement<[string]>,
    getArtistId: Database.Statement<[string], { id: number } | undefined>,
    deleteTrackArtists: Database.Statement<[number, string]>,
    insertTrackArtist: Database.Statement<[number, number, number, string]>,
  ): void {
    deleteTrackArtists.run(trackId, role)

    const seen = new Set<string>()
    let position = 0

    for (const rawName of names) {
      const name = rawName.trim()

      if (!name || seen.has(name)) {
        continue
      }

      seen.add(name)
      upsertArtist.run(name)

      const artist = getArtistId.get(name)
      if (!artist) {
        continue
      }

      insertTrackArtist.run(trackId, artist.id, position, role)
      position += 1
    }
  }
}
