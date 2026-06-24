import type {
  AlbumArtworkPatch,
  ScannedTrack,
  TrackListItem,
  TrackLyricsPatch,
  TrackLyrics,
} from '@shared/types/libraryScan'
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

export class TrackRepository extends BaseRepository {
  getFilePathById(trackId: number): string | null {
    const row = this.db
      .prepare(`SELECT file_path AS filePath FROM tracks WHERE id = ?`)
      .get(trackId) as { filePath: string } | undefined

    return row?.filePath ?? null
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
                duration_seconds AS durationSeconds,
                artwork_cache_key AS artworkCacheKey
         FROM library_track_display
         ORDER BY id ASC`,
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
        genre,
        lyrics_text,
        lyrics_format,
        lyrics_checked_mtime_ms,
        metadata_checked_mtime_ms,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
        genre = excluded.genre,
        lyrics_text = excluded.lyrics_text,
        lyrics_format = excluded.lyrics_format,
        lyrics_checked_mtime_ms = excluded.lyrics_checked_mtime_ms,
        metadata_checked_mtime_ms = excluded.metadata_checked_mtime_ms,
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
          track.genre,
          track.lyricsText,
          track.lyricsFormat,
          track.fileMtimeMs,
          track.fileMtimeMs,
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
}
