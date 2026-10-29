import { LEGACY_TAG_FIELDS } from '@shared/utils/metadataEditRequest'
import type Database from 'better-sqlite3'
import { parse } from 'node:path'
import type { FileTagValues, FileMetadataSnapshot } from '@shared/types/trackMetadata'
import { commitArtworkProjection, type ArtworkAlbumIdentity } from './trackArtworkProjection'
import { canonicalizeDelimitedValues, splitDelimitedValues } from '@shared/utils/delimitedValues'
import { replaceMetadataTrackArtists } from './metadataTrackArtists'

/** One transaction-local projection shared by scan, refresh, relocation and verified edits. */
export function prepareFileMetadataProjection(db: Database.Database) {
  const raw = db.prepare(`UPDATE tracks SET title=?, artist=?, album=?, album_artist=?,
    genre=?, year=?, release_date=?, title_fallback=? WHERE id=?`)
  const existing =
    db.prepare(`SELECT title,artist_display AS artistDisplay,album_title AS albumTitle,
    album_artist_display AS albumArtistDisplay,genre_display AS genreDisplay,year,
    release_date AS releaseDate,override_mask AS mask FROM track_metadata
    WHERE track_id=? AND source='legacy_user_edit'`)
  const release = db.prepare(
    `UPDATE track_metadata SET source='file_tag',override_mask=0 WHERE track_id=?`,
  )
  const sync = db.prepare(`UPDATE track_metadata SET
    (title,artist_display,album_title,album_artist_display,genre_display,year,release_date)=
      (SELECT title,artist,album,album_artist,genre,year,release_date FROM tracks WHERE id=track_metadata.track_id)
    WHERE track_id=? AND source='file_tag' AND override_mask=0`)
  const effective = db.prepare(
    `SELECT artist,album_artist AS albumArtist FROM library_track_display WHERE id=?`,
  )
  const upsertArtist = db.prepare<[string]>(
    `INSERT INTO artists(name) VALUES(?) ON CONFLICT(name) DO NOTHING`,
  )
  const artistId = db.prepare<[string], { id: number }>(`SELECT id FROM artists WHERE name=?`)
  const remove = db.prepare<[number, string]>(
    `DELETE FROM track_artists WHERE track_id=? AND role=?`,
  )
  const insert = db.prepare<[number, number, number, string]>(
    `INSERT OR IGNORE INTO track_artists(track_id,artist_id,position,role) VALUES(?,?,?,?)`,
  )
  return (
    trackId: number,
    filePath: string,
    tags?: FileTagValues,
    state: FileMetadataSnapshot = {},
    previous?: ArtworkAlbumIdentity,
  ) => {
    if (tags) {
      raw.run(
        tags.title,
        tags.artistDisplay,
        tags.albumTitle,
        tags.albumArtistDisplay,
        tags.genreDisplay,
        tags.year,
        tags.releaseDate,
        parse(filePath).name,
        trackId,
      )
      const extra = [
        'trackNo',
        'trackTotal',
        'discNo',
        'discTotal',
        'composer',
        'copyright',
        'isrc',
      ] as const
      const columns = {
        trackNo: 'track_no',
        trackTotal: 'track_total',
        discNo: 'disc_no',
        discTotal: 'disc_total',
        composer: 'composer',
        copyright: 'copyright',
        isrc: 'isrc',
      }
      const included = extra.filter((key) => Object.hasOwn(tags, key))
      if (included.length)
        db.prepare(
          `UPDATE tracks SET ${included.map((key) => columns[key] + '=?').join(',')} WHERE id=?`,
        ).run(...included.map((key) => tags[key] ?? null), trackId)
      const legacy = existing.get(trackId) as (FileTagValues & { mask: number }) | undefined
      // Old overrides have no field-level history. Release only a complete, exact semantic match.
      if (
        legacy &&
        LEGACY_TAG_FIELDS.every((key) => {
          const left = legacy[key],
            right = tags[key]
          return ['artistDisplay', 'albumArtistDisplay', 'genreDisplay'].includes(key)
            ? canonicalizeDelimitedValues(left as string | null) ===
                canonicalizeDelimitedValues(right as string | null)
            : left === right
        })
      )
        release.run(trackId)
    }
    sync.run(trackId)
    const row = effective.get(trackId) as
      | { artist: string | null; albumArtist: string | null }
      | undefined
    if (!row) return
    replaceMetadataTrackArtists(
      trackId,
      splitDelimitedValues(row.artist),
      'primary',
      upsertArtist,
      artistId,
      remove,
      insert,
    )
    replaceMetadataTrackArtists(
      trackId,
      splitDelimitedValues(row.albumArtist),
      'album_artist',
      upsertArtist,
      artistId,
      remove,
      insert,
    )
    commitArtworkProjection(db, trackId, state, previous)
  }
}
