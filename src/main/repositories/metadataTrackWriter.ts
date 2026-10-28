import type Database from 'better-sqlite3'
import {
  canonicalizeDelimitedValues,
  cleanDelimitedValues,
  joinDelimitedValues,
} from '@shared/utils/delimitedValues'
import type { RefreshedTrackMetadata } from './metadataRefreshRepositoryTypes'
import { replaceMetadataTrackArtists } from './metadataTrackArtists'
import { encodeScanFileFingerprint } from '@shared/utils/trackFileFingerprint'
import { prepareFileMetadataProjection } from './fileMetadataProjection'
import { captureArtworkAlbum } from './trackArtworkProjection'

export class MetadataTrackWriter {
  constructor(private readonly db: Database.Database) {}

  updateTrackMetadata(result: RefreshedTrackMetadata): void {
    const project = prepareFileMetadataProjection(this.db)
    // These results do not carry a stable sidecar snapshot. Invalidate that
    // derived scan fingerprint so the next scan verifies the current lyric sidecars.
    // Full file_tag write — skipped when user_edit must be preserved.
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
        artwork_cache_key = CASE
          WHEN excluded.artwork_cache_key LIKE 'v2-%.webp'
            AND (
              track_metadata.artwork_cache_key IS NULL
              OR track_metadata.artwork_cache_key NOT LIKE 'v2-%.webp'
            )
          THEN excluded.artwork_cache_key
          ELSE track_metadata.artwork_cache_key
        END,
        source = excluded.source,
        refreshed_at = CURRENT_TIMESTAMP
      WHERE track_metadata.source NOT IN ('user_edit', 'legacy_user_edit')
    `)

    // Technical + non-display fields only (keeps user-edited display columns).
    const updateTrackTechnical = this.db.prepare(`
      UPDATE tracks
      SET track_no = ?,
          disc_no = ?,
          duration_seconds = ?,
          bitrate_bps = ?,
          codec = ?,
          copyright = ?,
          composer = ?,
          lyrics_text = ?,
          lyrics_format = ?,
          isrc = ?,
          metadata_signature = ?,
          file_size = ?,
          file_mtime_ms = ?,
          lyrics_checked_mtime_ms = ?,
          lyrics_sidecar_fingerprint = NULL,
          metadata_checked_mtime_ms = ?,
          metadata_parser_version = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND file_path = ?
    `)

    const updateTrackFull = this.db.prepare(`
      UPDATE tracks
      SET title = ?,
          artist = ?,
          album = ?,
          album_artist = ?,
          track_no = ?,
          disc_no = ?,
          duration_seconds = ?,
          bitrate_bps = ?,
          codec = ?,
          year = ?,
          release_date = ?,
          copyright = ?,
          composer = ?,
          genre = ?,
          lyrics_text = ?,
          lyrics_format = ?,
          isrc = ?,
          metadata_signature = ?,
          file_size = ?,
          file_mtime_ms = ?,
          lyrics_checked_mtime_ms = ?,
          lyrics_sidecar_fingerprint = NULL,
          metadata_checked_mtime_ms = ?,
          metadata_parser_version = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND file_path = ?
    `)

    // When preserving user_edit, still refresh lyrics/artwork side-data on track_metadata.
    const patchUserEditSideData = this.db.prepare(`
      UPDATE track_metadata
      SET lyrics_text = ?,
          lyrics_format = ?,
          artwork_cache_key = CASE
            WHEN ? LIKE 'v2-%.webp'
              AND (
                artwork_cache_key IS NULL
                OR artwork_cache_key NOT LIKE 'v2-%.webp'
              )
            THEN ?
            ELSE artwork_cache_key
          END,
          refreshed_at = CURRENT_TIMESTAMP
      WHERE track_id = ?
        AND source IN ('user_edit', 'legacy_user_edit')
    `)

    const upsertAlbum = this.db.prepare(`
      INSERT INTO albums (title, artist, artwork_cache_key)
      VALUES (?, ?, ?)
      ON CONFLICT(title, artist) DO UPDATE SET
        artwork_cache_key = CASE
          WHEN excluded.artwork_cache_key LIKE 'v2-%.webp'
            AND (
              albums.artwork_cache_key IS NULL
              OR albums.artwork_cache_key NOT LIKE 'v2-%.webp'
            )
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

    const getArtistId = this.db.prepare<[string], { id: number } | undefined>(`
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

    const write = this.db.transaction((metadata: RefreshedTrackMetadata) => {
      this.assertTrackIdentity(metadata)
      const previous = captureArtworkAlbum(this.db, metadata.trackId)
      this.db
        .prepare('UPDATE tracks SET file_stat_fingerprint = ? WHERE id = ? AND file_path = ?')
        .run(
          encodeScanFileFingerprint(metadata.fileFingerprint),
          metadata.trackId,
          metadata.sourceFilePath,
        )
      const existingSource = this.db
        .prepare('SELECT source FROM track_metadata WHERE track_id = ?')
        .get(metadata.trackId) as { source: string } | undefined
      const preserveUserEdit =
        existingSource?.source === 'user_edit' || existingSource?.source === 'legacy_user_edit'
      const artists = cleanDelimitedValues(
        metadata.artists.length > 0
          ? metadata.artists
          : [metadata.artistDisplay || metadata.artist],
      )
      const artistDisplay = joinDelimitedValues(artists) || 'Unknown Artist'
      const albumTitle = metadata.albumTitle || metadata.album
      const albumArtists = cleanDelimitedValues(
        metadata.albumArtists.length > 0
          ? metadata.albumArtists
          : [metadata.albumArtistDisplay || metadata.albumArtist || artistDisplay],
      )
      const albumArtistDisplay = joinDelimitedValues(albumArtists) || artistDisplay
      const genreDisplay = joinDelimitedValues(
        cleanDelimitedValues(metadata.genres.length > 0 ? metadata.genres : [metadata.genre]),
      )
      const copyright = canonicalizeDelimitedValues(metadata.copyright)
      const composer = canonicalizeDelimitedValues(metadata.composer)

      if (preserveUserEdit) {
        // Keep user_edit display fields / source; still refresh technical + lyrics data.
        patchUserEditSideData.run(
          metadata.lyricsText,
          metadata.lyricsFormat,
          metadata.artworkCacheKey,
          metadata.artworkCacheKey,
          metadata.trackId,
        )
        updateTrackTechnical.run(
          metadata.trackNo,
          metadata.discNo,
          metadata.durationSeconds,
          metadata.bitrateBps,
          metadata.codec ?? null,
          copyright,
          composer,
          metadata.lyricsText,
          metadata.lyricsFormat,
          metadata.isrc,
          metadata.metadataSignature,
          metadata.fileSize,
          metadata.fileMtimeMs,
          metadata.fileMtimeMs,
          metadata.fileMtimeMs,
          metadata.metadataParserVersion ?? '',
          metadata.trackId,
          metadata.sourceFilePath,
        )
        project(metadata.trackId, metadata.sourceFilePath, metadata.fileTags, metadata, previous)
        return
      }

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

      updateTrackFull.run(
        metadata.title,
        artistDisplay,
        albumTitle,
        albumArtistDisplay,
        metadata.trackNo,
        metadata.discNo,
        metadata.durationSeconds,
        metadata.bitrateBps,
        metadata.codec ?? null,
        metadata.year,
        metadata.releaseDate,
        copyright,
        composer,
        genreDisplay,
        metadata.lyricsText,
        metadata.lyricsFormat,
        metadata.isrc,
        metadata.metadataSignature,
        metadata.fileSize,
        metadata.fileMtimeMs,
        metadata.fileMtimeMs,
        metadata.fileMtimeMs,
        metadata.metadataParserVersion ?? '',
        metadata.trackId,
        metadata.sourceFilePath,
      )

      upsertAlbum.run(albumTitle, albumArtistDisplay, metadata.artworkCacheKey)
      replaceMetadataTrackArtists(
        metadata.trackId,
        artists,
        'primary',
        upsertArtist,
        getArtistId,
        deleteTrackArtists,
        insertTrackArtist,
      )
      replaceMetadataTrackArtists(
        metadata.trackId,
        albumArtists,
        'album_artist',
        upsertArtist,
        getArtistId,
        deleteTrackArtists,
        insertTrackArtist,
      )
      project(metadata.trackId, metadata.sourceFilePath, metadata.fileTags, metadata, previous)
    })

    write(result)
  }

  updateTrackLyrics(result: RefreshedTrackMetadata): void {
    this.db.transaction(() => {
      const fingerprint = this.assertTrackIdentity(result)
      if (
        fingerprint.fileSize !== result.fileSize ||
        fingerprint.fileMtimeMs !== result.fileMtimeMs
      ) {
        // The worker already read full tags: an audio change must not be consumed as lyrics-only.
        this.updateTrackMetadata(result)
        return
      }
      this.db
        .prepare(
          `UPDATE tracks
         SET lyrics_text = ?,
             lyrics_format = ?,
             lyrics_checked_mtime_ms = ?,
             lyrics_sidecar_fingerprint = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND file_path = ?`,
        )
        .run(
          result.lyricsText,
          result.lyricsFormat,
          result.fileMtimeMs,
          result.trackId,
          result.sourceFilePath,
        )

      this.db
        .prepare(
          `UPDATE track_metadata
         SET lyrics_text = ?,
             lyrics_format = ?,
             refreshed_at = CURRENT_TIMESTAMP
         WHERE track_id = ?`,
        )
        .run(result.lyricsText, result.lyricsFormat, result.trackId)
    })()
  }

  assertTrackIdentity(
    result: Pick<RefreshedTrackMetadata, 'trackId' | 'sourceFilePath' | 'fileSize' | 'fileMtimeMs'>,
  ) {
    if (
      !Number.isSafeInteger(result.fileSize) ||
      result.fileSize < 0 ||
      !Number.isFinite(result.fileMtimeMs)
    ) {
      throw new Error('Invalid metadata file fingerprint')
    }
    const row = this.db
      .prepare(
        `SELECT file_size AS fileSize, file_mtime_ms AS fileMtimeMs
      FROM tracks WHERE id = ? AND file_path = ?`,
      )
      .get(result.trackId, result.sourceFilePath) as
      | { fileSize: number | null; fileMtimeMs: number | null }
      | undefined
    if (!row) throw new Error('Metadata track identity changed or track was removed')
    return row
  }
}
