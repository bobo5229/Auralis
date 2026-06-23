import type { ScannedTrack } from '@shared/types/libraryScan'
import { BaseRepository } from './baseRepository'

export interface KnownTrackFile {
  filePath: string
  fileSize: number | null
  fileMtimeMs: number | null
}

export class TrackRepository extends BaseRepository {
  getKnownFiles(): KnownTrackFile[] {
    const rows = this.db
      .prepare(
        `
          SELECT file_path AS filePath,
                 file_size AS fileSize,
                 file_mtime_ms AS fileMtimeMs
          FROM tracks
        `,
      )
      .all() as KnownTrackFile[]

    return rows
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
        genre,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
        genre = excluded.genre,
        updated_at = CURRENT_TIMESTAMP
    `)

    const insertAlbum = this.db.prepare(`
      INSERT INTO albums (title, artist)
      VALUES (?, ?)
      ON CONFLICT(title, artist) DO NOTHING
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
          track.genre,
        )
        insertAlbum.run(track.album, track.albumArtist || track.artist)
      }
    })

    for (let index = 0; index < tracks.length; index += 300) {
      upsertBatch(tracks.slice(index, index + 300))
    }
  }
}
