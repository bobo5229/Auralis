import type Database from 'better-sqlite3'
import type { ScannedTrack } from '@shared/types/libraryScan'

/** Called inside the same transaction that writes the scan fingerprint/version. */
export function prepareScannedMetadataDisplayUpdate(db: Database.Database) {
  // The display view must not hide a backfill behind stale file-derived values.
  // User-edited overrides retain their existing priority.
  const update = db.prepare(`
    UPDATE track_metadata
    SET title = ?, artist_display = ?, album_title = ?, album_artist_display = ?,
        genre_display = ?, year = ?, release_date = ?, lyrics_text = ?, lyrics_format = ?,
        refreshed_at = CURRENT_TIMESTAMP
    WHERE track_id = (SELECT id FROM tracks WHERE file_path = ?) AND source = 'file_tag'
  `)
  return (track: ScannedTrack) =>
    update.run(
      track.title,
      track.artist,
      track.album,
      track.albumArtist,
      track.genre,
      track.year,
      track.releaseDate,
      track.lyricsText,
      track.lyricsFormat,
      track.filePath,
    )
}
