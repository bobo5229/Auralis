import type Database from 'better-sqlite3'
import type { ScannedTrack, TrackTagPatch } from '@shared/types/libraryScan'
import { prepareFileMetadataProjection } from './fileMetadataProjection'
import type { ArtworkAlbumIdentity } from './trackArtworkProjection'

/** Called inside the same transaction that writes the scan fingerprint/version. */
export function prepareScannedMetadataDisplayUpdate(db: Database.Database) {
  const project = prepareFileMetadataProjection(db)
  const trackId = db.prepare('SELECT id FROM tracks WHERE file_path=?')
  // The display view must not hide a backfill behind stale file-derived values.
  // User-edited overrides retain their existing priority.
  const update = db.prepare(`
    UPDATE track_metadata
    SET title = ?, artist_display = ?, album_title = ?, album_artist_display = ?,
        genre_display = ?, year = ?, release_date = ?, lyrics_text = ?, lyrics_format = ?,
        refreshed_at = CURRENT_TIMESTAMP
    WHERE track_id = (SELECT id FROM tracks WHERE file_path = ?) AND source = 'file_tag'
  `)
  return (track: ScannedTrack, previous?: ArtworkAlbumIdentity) => {
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
    const row = trackId.get(track.filePath) as { id: number } | undefined
    if (row) project(row.id, track.filePath, track.fileTags, track, previous)
  }
}

/** Tag backfill refreshes file-derived display fields and leaves lyrics on the lyrics patch path. */
export function prepareScannedTagDisplayUpdate(db: Database.Database) {
  const project = prepareFileMetadataProjection(db)
  const trackId = db.prepare('SELECT id FROM tracks WHERE file_path=?')
  const update = db.prepare(`
    UPDATE track_metadata
    SET title = ?, artist_display = ?, album_title = ?, album_artist_display = ?,
        genre_display = ?, year = ?, release_date = ?, refreshed_at = CURRENT_TIMESTAMP
    WHERE track_id = (SELECT id FROM tracks WHERE file_path = ?) AND source = 'file_tag'
  `)
  return (patch: TrackTagPatch, previous?: ArtworkAlbumIdentity) => {
    update.run(
      patch.title,
      patch.artist,
      patch.album,
      patch.albumArtist,
      patch.genre,
      patch.year,
      patch.releaseDate,
      patch.filePath,
    )
    const row = trackId.get(patch.filePath) as { id: number } | undefined
    if (row) project(row.id, patch.filePath, patch.fileTags, patch, previous)
  }
}
