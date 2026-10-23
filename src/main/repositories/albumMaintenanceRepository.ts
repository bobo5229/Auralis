import { BaseRepository } from './baseRepository'

// Preserve both the raw identity and the effective display identity. Metadata
// overrides can use a different album without making the raw fallback obsolete.
// Give the computed artist column TEXT affinity so SQLite can index both join
// keys; indexing only title becomes quadratic for many same-title albums.
const unusedAlbumIds = `
  WITH referenced AS MATERIALIZED (
    SELECT album AS title, CAST(COALESCE(NULLIF(album_artist, ''), artist) AS TEXT) AS artist
    FROM tracks
    UNION
    SELECT COALESCE(metadata.album_title, tracks.album),
           CAST(COALESCE(
             NULLIF(COALESCE(metadata.album_artist_display, tracks.album_artist), ''),
             COALESCE(metadata.artist_display, tracks.artist)
           ) AS TEXT)
    FROM tracks JOIN track_metadata AS metadata ON metadata.track_id = tracks.id
  )
  SELECT albums.id FROM albums
  LEFT JOIN referenced
    ON referenced.title IS albums.title AND referenced.artist IS albums.artist
  WHERE referenced.title IS NULL
`

export class AlbumMaintenanceRepository extends BaseRepository {
  hasUnusedAlbums(): boolean {
    return this.db.prepare(`SELECT 1 FROM (${unusedAlbumIds}) LIMIT 1`).get() !== undefined
  }

  removeUnusedAlbums(): number {
    return this.db.prepare(`DELETE FROM albums WHERE id IN (${unusedAlbumIds})`).run().changes
  }
}
