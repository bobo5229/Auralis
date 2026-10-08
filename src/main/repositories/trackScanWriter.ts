import type { ScannedTrack, AlbumArtworkPatch, TrackLyricsPatch } from '@shared/types/libraryScan'
import { BaseRepository } from './baseRepository'

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
        isrc,
        metadata_signature,
        availability,
        missing_since,
        updated_at
      )
      VALUES (MAX(COALESCE((SELECT MAX(id) FROM tracks),0),COALESCE((SELECT MAX(id) FROM removed_track_history),0))+1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', NULL, CURRENT_TIMESTAMP)
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
        composer = excluded.composer,
        genre = excluded.genre,
        lyrics_text = excluded.lyrics_text,
        lyrics_format = excluded.lyrics_format,
        lyrics_checked_mtime_ms = excluded.lyrics_checked_mtime_ms,
        lyrics_sidecar_fingerprint = excluded.lyrics_sidecar_fingerprint,
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
        WHERE excluded.artwork_cache_key LIKE 'v2-%.webp'
          AND (
            albums.artwork_cache_key IS NULL
            OR albums.artwork_cache_key NOT LIKE 'v2-%.webp'
          )
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
          track.composer,
          track.genre,
          track.lyricsText,
          track.lyricsFormat,
          track.fileMtimeMs,
          track.lyricsSidecarFingerprint ?? null,
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
        WHERE excluded.artwork_cache_key LIKE 'v2-%.webp'
          AND (
            albums.artwork_cache_key IS NULL
            OR albums.artwork_cache_key NOT LIKE 'v2-%.webp'
          )
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
}
