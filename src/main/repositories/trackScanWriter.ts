import type {
  ScannedTrack,
  AlbumArtworkPatch,
  TrackLyricsPatch,
  TrackTagPatch,
} from '@shared/types/libraryScan'
import {
  isCurrentArtworkCacheKey,
  CURRENT_ARTWORK_KEY_SQL_LIKE_PATTERN,
} from '@main/shared/artworkCachePolicy'
import { encodeScanFileFingerprint } from '@shared/utils/trackFileFingerprint'
import { BaseRepository } from './baseRepository'
import { captureArtworkAlbum, commitArtworkProjection } from './trackArtworkProjection'
import {
  prepareScannedMetadataDisplayUpdate,
  prepareScannedTagDisplayUpdate,
} from './scannedMetadataDisplay'

export class TrackScanWriter extends BaseRepository {
  upsertMany(tracks: ScannedTrack[]): void {
    if (tracks.length === 0) {
      return
    }

    const upsertTrack = this.db.prepare(`
      INSERT INTO tracks (
        id,
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
        bitrate_bps,
        codec,
        year,
        release_date,
        copyright,
        composer,
        genre,
        lyrics_text,
        lyrics_format,
        lyrics_checked_mtime_ms,
        lyrics_sidecar_fingerprint,
        metadata_checked_mtime_ms,
        metadata_parser_version,
        isrc,
        metadata_signature,
        availability,
        missing_since,
        updated_at
      )
      VALUES (MAX(COALESCE((SELECT MAX(id) FROM tracks),0),COALESCE((SELECT MAX(id) FROM removed_track_history),0))+1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', NULL, CURRENT_TIMESTAMP)
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
        bitrate_bps = excluded.bitrate_bps,
        codec = excluded.codec,
        year = excluded.year,
        release_date = excluded.release_date,
        copyright = excluded.copyright,
        composer = excluded.composer,
        genre = excluded.genre,
        lyrics_text = excluded.lyrics_text,
        lyrics_format = excluded.lyrics_format,
        lyrics_checked_mtime_ms = excluded.lyrics_checked_mtime_ms,
        lyrics_sidecar_fingerprint = excluded.lyrics_sidecar_fingerprint,
        metadata_checked_mtime_ms = excluded.metadata_checked_mtime_ms,
        metadata_parser_version = excluded.metadata_parser_version,
        isrc = excluded.isrc,
        metadata_signature = excluded.metadata_signature,
        availability = 'available',
        missing_since = NULL,
        updated_at = CURRENT_TIMESTAMP
    `)

    const syncFileMetadata = prepareScannedMetadataDisplayUpdate(this.db)
    const updateFingerprint = this.db.prepare(
      'UPDATE tracks SET file_stat_fingerprint = ? WHERE file_path = ?',
    )

    const upsertAlbum = this.db.prepare(`
      INSERT INTO albums (title, artist, artwork_cache_key)
      VALUES (?, ?, ?)
      ON CONFLICT(title, artist) DO UPDATE SET
        artwork_cache_key = excluded.artwork_cache_key
        WHERE excluded.artwork_cache_key LIKE '${CURRENT_ARTWORK_KEY_SQL_LIKE_PATTERN}'
          AND (
            albums.artwork_cache_key IS NULL
            OR albums.artwork_cache_key NOT LIKE '${CURRENT_ARTWORK_KEY_SQL_LIKE_PATTERN}'
          )
    `)

    const upsertBatch = this.db.transaction((items: ScannedTrack[]) => {
      for (const track of items) {
        const oldId = this.db
          .prepare('SELECT id FROM tracks WHERE file_path=?')
          .pluck()
          .get(track.filePath) as number | undefined
        const previous = oldId ? captureArtworkAlbum(this.db, oldId) : undefined
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
          track.bitrateBps,
          track.codec ?? null,
          track.year,
          track.releaseDate,
          track.copyright,
          track.composer,
          track.genre,
          track.lyricsText,
          track.lyricsFormat,
          track.fileMtimeMs,
          track.lyricsSidecarFingerprint ?? null,
          track.fileMtimeMs,
          track.metadataParserVersion ?? '',
          track.isrc,
          track.metadataSignature,
        )
        updateFingerprint.run(encodeScanFileFingerprint(track.fileFingerprint), track.filePath)
        upsertAlbum.run(track.album, track.albumArtist || track.artist, track.artworkCacheKey)
        syncFileMetadata(track, previous)
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
        WHERE excluded.artwork_cache_key LIKE '${CURRENT_ARTWORK_KEY_SQL_LIKE_PATTERN}'
          AND (
            albums.artwork_cache_key IS NULL
            OR albums.artwork_cache_key NOT LIKE '${CURRENT_ARTWORK_KEY_SQL_LIKE_PATTERN}'
          )
    `)

    const batch = this.db.transaction((patches: AlbumArtworkPatch[]) => {
      for (const patch of patches) {
        if (patch.filePath && patch.artworkRead) {
          const id = this.db
            .prepare('SELECT id FROM tracks WHERE file_path=?')
            .pluck()
            .get(patch.filePath) as number | undefined
          if (id) commitArtworkProjection(this.db, id, patch)
          continue
        }
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
          lyrics_sidecar_fingerprint = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE file_path = ?
    `)

    const updateDisplay = this.db.prepare(`
      UPDATE track_metadata SET lyrics_text = ?, lyrics_format = ?, refreshed_at = CURRENT_TIMESTAMP
      WHERE track_id = (SELECT id FROM tracks WHERE file_path = ?)
    `)

    const batch = this.db.transaction((patches: TrackLyricsPatch[]) => {
      for (const patch of patches) {
        update.run(
          patch.lyricsText,
          patch.lyricsFormat,
          patch.lyricsCheckedMtimeMs,
          patch.lyricsSidecarFingerprint ?? null,
          patch.filePath,
        )
        // Display metadata can also hold lyrics; clearing a sidecar must clear both.
        updateDisplay.run(patch.lyricsText, patch.lyricsFormat, patch.filePath)
      }
    })

    for (let index = 0; index < items.length; index += 300) {
      batch(items.slice(index, index + 300))
    }
  }

  /** Update text tags and the parser fingerprint without rewriting duration, bitrate, codec or lyrics. */
  patchTrackTags(items: TrackTagPatch[]): void {
    if (items.length === 0) return

    const update = this.db.prepare(`
      UPDATE tracks
      SET title = ?,
          artist = ?,
          album = ?,
          album_artist = ?,
          track_no = ?,
          disc_no = ?,
          year = ?,
          release_date = ?,
          copyright = ?,
          composer = ?,
          genre = ?,
          isrc = ?,
          metadata_signature = ?,
          metadata_checked_mtime_ms = ?,
          metadata_parser_version = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE file_path = ?
    `)
    const syncFileMetadata = prepareScannedTagDisplayUpdate(this.db)
    const updateFingerprint = this.db.prepare(
      'UPDATE tracks SET file_stat_fingerprint = ? WHERE file_path = ?',
    )
    const upsertAlbum = this.db.prepare(`
      INSERT INTO albums (title, artist, artwork_cache_key)
      VALUES (?, ?, ?)
      ON CONFLICT(title, artist) DO UPDATE SET
        artwork_cache_key = excluded.artwork_cache_key
        WHERE excluded.artwork_cache_key LIKE '${CURRENT_ARTWORK_KEY_SQL_LIKE_PATTERN}'
          AND (
            albums.artwork_cache_key IS NULL
            OR albums.artwork_cache_key NOT LIKE '${CURRENT_ARTWORK_KEY_SQL_LIKE_PATTERN}'
          )
    `)
    const batch = this.db.transaction((patches: TrackTagPatch[]) => {
      for (const patch of patches) {
        const oldId = this.db
          .prepare('SELECT id FROM tracks WHERE file_path=?')
          .pluck()
          .get(patch.filePath) as number | undefined
        const previous = oldId ? captureArtworkAlbum(this.db, oldId) : undefined
        update.run(
          patch.title,
          patch.artist,
          patch.album,
          patch.albumArtist,
          patch.trackNo,
          patch.discNo,
          patch.year,
          patch.releaseDate,
          patch.copyright,
          patch.composer,
          patch.genre,
          patch.isrc,
          patch.metadataSignature,
          patch.fileMtimeMs,
          patch.metadataParserVersion ?? '',
          patch.filePath,
        )
        updateFingerprint.run(encodeScanFileFingerprint(patch.fileFingerprint), patch.filePath)
        if (isCurrentArtworkCacheKey(patch.artworkCacheKey)) {
          upsertAlbum.run(patch.album, patch.albumArtist || patch.artist, patch.artworkCacheKey)
        }
        syncFileMetadata(patch, previous)
      }
    })

    for (let index = 0; index < items.length; index += 300) {
      batch(items.slice(index, index + 300))
    }
  }
}
