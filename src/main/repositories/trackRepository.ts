import type { AlbumArtworkPatch, ScannedTrack, TrackListItem } from '@shared/types/libraryScan'
import { BaseRepository } from './baseRepository'

export interface KnownTrackFile {
  filePath: string
  fileSize: number | null
  fileMtimeMs: number | null
  album: string | null
  albumArtist: string | null
  artworkCacheKey: string | null
}

export class TrackRepository extends BaseRepository {
  getAll(): TrackListItem[] {
    return this.db
      .prepare(
        `SELECT t.id, t.title, t.artist, t.album,
                t.duration_seconds AS durationSeconds,
                a.artwork_cache_key AS artworkCacheKey
         FROM tracks t
         LEFT JOIN albums a ON t.album = a.title AND t.album_artist = a.artist
         ORDER BY t.id ASC`,
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
                a.artwork_cache_key AS artworkCacheKey
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
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
}
