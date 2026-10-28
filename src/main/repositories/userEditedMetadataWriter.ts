import type Database from 'better-sqlite3'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import {
  normalizeEditableText,
  normalizeEditableYear,
  normalizeEditableReleaseDate,
  normalizeEditableMetadata,
} from '../features/metadata/editableMetadataValidation'
import { splitDelimitedValues } from '@shared/utils/delimitedValues'
import { replaceMetadataTrackArtists } from './metadataTrackArtists'
import { ALL_METADATA_OVERRIDES } from '@shared/types/metadataOverrides'

export function resolveArtworkKeyForUserEdit(
  trackMetadataKey: string | null | undefined,
  albumKey: string | null | undefined,
): string | null {
  if (trackMetadataKey) return trackMetadataKey
  if (albumKey) return albumKey
  return null
}

export class UserEditedMetadataWriter {
  constructor(private readonly db: Database.Database) {}

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
      const existingArtwork = this.db
        .prepare(
          `SELECT tm.artwork_cache_key AS trackMetadataKey,
                  d.artwork_cache_key AS albumKey
           FROM tracks t
           LEFT JOIN track_metadata tm ON tm.track_id = t.id
           LEFT JOIN library_track_display d ON d.id = t.id
           WHERE t.id = ?`,
        )
        .get(item.trackId) as
        | { trackMetadataKey: string | null; albumKey: string | null }
        | undefined
      const artworkCacheKey = resolveArtworkKeyForUserEdit(
        existingArtwork?.trackMetadataKey,
        existingArtwork?.albumKey,
      )

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
            artwork_cache_key,
            source,
            override_mask,
            refreshed_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'legacy_user_edit', ${ALL_METADATA_OVERRIDES}, CURRENT_TIMESTAMP)
          ON CONFLICT(track_id) DO UPDATE SET
            title = excluded.title,
            artist_display = excluded.artist_display,
            album_title = excluded.album_title,
            album_artist_display = excluded.album_artist_display,
            genre_display = excluded.genre_display,
            year = excluded.year,
            release_date = excluded.release_date,
            artwork_cache_key = COALESCE(
              track_metadata.artwork_cache_key,
              excluded.artwork_cache_key
            ),
            source = excluded.source,
            override_mask = excluded.override_mask,
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
          artworkCacheKey,
        )

      replaceMetadataTrackArtists(
        item.trackId,
        artistDisplay ? splitDelimitedValues(artistDisplay) : [],
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
      replaceMetadataTrackArtists(
        item.trackId,
        albumArtistDisplay ? splitDelimitedValues(albumArtistDisplay) : [],
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

    update(normalizeEditableMetadata(metadata))
  }
}
