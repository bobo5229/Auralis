import type { TrackListItem, TrackLyrics } from '@shared/types/libraryScan'
import type { PlaybackTrackDto } from '@shared/types/playback'
import type { AlbumDetailSummary } from '@shared/types/albumDetail'
import { normalizeDelimitedValue, splitDelimitedValues } from '@shared/utils/delimitedValues'
import type { KnownTrackFile } from './trackRepositoryTypes'
import { toPathVariants } from './trackRepositoryPaths'
import { sortLibraryTracks } from './libraryTrackSort'
import { BaseRepository } from './baseRepository'

const TRACK_LIST_ITEM_COLUMNS = `id, title, artist, album,
                album_artist AS albumArtist,
                track_no AS trackNo,
                disc_no AS discNo,
                release_date AS releaseDate,
                copyright,
                composer,
                duration_seconds AS durationSeconds,
                artwork_cache_key AS artworkCacheKey,
                genre,
                availability,
                play_count AS playCount,
                last_played_at AS lastPlayedAt,
                created_at AS createdAt`

/** Matches renderer album identity: albumArtist || artist || 'Unknown Artist'. */
const albumArtistIdentityExpr = `CASE
          WHEN NULLIF(album_artist, '') IS NOT NULL THEN album_artist
          WHEN NULLIF(artist, '') IS NOT NULL THEN artist
          ELSE 'Unknown Artist'
        END`

/** Matches renderer album identity: album || 'Unknown Album'. */
const albumTitleIdentityExpr = `CASE
          WHEN NULLIF(album, '') IS NOT NULL THEN album
          ELSE 'Unknown Album'
        END`

export class TrackQueryRepository extends BaseRepository {
  getChangeToken(): string {
    // total_changes covers this connection; data_version covers worker connections.
    const version = this.db
      .prepare('SELECT total_changes() AS local, data_version AS external FROM pragma_data_version')
      .get() as { local: number; external: number }
    return `${version.local}:${version.external}`
  }

  getFilePathById(trackId: number): string | null {
    const row = this.db
      .prepare(`SELECT file_path AS filePath FROM tracks WHERE id = ?`)
      .get(trackId) as { filePath: string } | undefined

    return row?.filePath ?? null
  }

  getTrackIdsByFilePaths(filePaths: string[]): number[] {
    const uniquePaths = [...new Set(filePaths)].filter(Boolean)

    if (uniquePaths.length === 0) {
      return []
    }

    const trackIds: number[] = []

    for (let index = 0; index < uniquePaths.length; index += 400) {
      const batch = uniquePaths.slice(index, index + 400)
      const placeholders = batch.map(() => '?').join(', ')
      const rows = this.db
        .prepare(`SELECT id FROM tracks WHERE file_path IN (${placeholders})`)
        .all(...batch) as Array<{ id: number }>

      trackIds.push(...rows.map((row) => row.id))
    }

    return trackIds
  }

  getTrackIdsByPlaybackPath(filePath: string): number[] {
    const variants = process.platform === 'win32' ? toPathVariants(filePath) : [filePath]
    const collation = process.platform === 'win32' ? 'COLLATE NOCASE' : ''
    const rows = this.db
      .prepare(
        `SELECT id FROM tracks WHERE file_path ${collation} IN (${variants.map(() => '?').join(', ')})`,
      )
      .all(...variants) as Array<{ id: number }>
    return rows.map((row) => row.id)
  }

  getExistingFilePaths(filePaths: string[]): Set<string> {
    const uniquePaths = [...new Set(filePaths)].filter(Boolean)

    if (uniquePaths.length === 0) {
      return new Set()
    }

    const existing = new Set<string>()

    for (let index = 0; index < uniquePaths.length; index += 400) {
      const batch = uniquePaths.slice(index, index + 400)
      const placeholders = batch.map(() => '?').join(', ')
      const rows = this.db
        .prepare(`SELECT file_path AS filePath FROM tracks WHERE file_path IN (${placeholders})`)
        .all(...batch) as Array<{ filePath: string }>

      for (const row of rows) {
        existing.add(row.filePath)
      }
    }

    return existing
  }

  /**
   * Read the persisted scan fingerprint (file_size + file_mtime_ms) for the
   * given paths. Paths absent from the table are simply not present in the
   * map. Used by the metadata watcher to skip a refresh job when a file was
   * only opened for reading (same fingerprint as the last scan).
   */
  getFileFingerprintsByFilePaths(
    filePaths: string[],
  ): Map<string, { fileSize: number; fileMtimeMs: number }> {
    const uniquePaths = [...new Set(filePaths)].filter(Boolean)
    const fingerprints = new Map<string, { fileSize: number; fileMtimeMs: number }>()

    if (uniquePaths.length === 0) {
      return fingerprints
    }

    for (let index = 0; index < uniquePaths.length; index += 400) {
      const batch = uniquePaths.slice(index, index + 400)
      const placeholders = batch.map(() => '?').join(', ')
      const rows = this.db
        .prepare(
          `SELECT file_path AS filePath, file_size AS fileSize, file_mtime_ms AS fileMtimeMs
           FROM tracks WHERE file_path IN (${placeholders})`,
        )
        .all(...batch) as Array<{ filePath: string; fileSize: number; fileMtimeMs: number }>

      for (const row of rows) {
        fingerprints.set(row.filePath, { fileSize: row.fileSize, fileMtimeMs: row.fileMtimeMs })
      }
    }

    return fingerprints
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
    const tracks = this.db
      .prepare(
        `SELECT ${TRACK_LIST_ITEM_COLUMNS}
         FROM library_track_display
         WHERE availability = 'available'
         ORDER BY id ASC`,
      )
      .all() as TrackListItem[]

    return sortLibraryTracks(tracks)
  }

  getAlbumDetailTracks(albumArtist: string, albumTitle: string): TrackListItem[] {
    return this.db
      .prepare(
        `SELECT ${TRACK_LIST_ITEM_COLUMNS}
         FROM library_track_display
         WHERE availability = 'available'
           AND ${albumArtistIdentityExpr} = ?
           AND ${albumTitleIdentityExpr} = ?
         ORDER BY
           COALESCE(disc_no, 1) ASC,
           CASE WHEN track_no IS NULL THEN 1 ELSE 0 END,
           track_no ASC,
           title COLLATE NOCASE ASC,
           id ASC`,
      )
      .all(albumArtist, albumTitle) as TrackListItem[]
  }

  getArtistAlbumSummaries(albumArtist: string, excludeAlbumTitle: string): AlbumDetailSummary[] {
    return this.db
      .prepare(
        `SELECT
            ${albumArtistIdentityExpr} AS albumArtist,
            ${albumTitleIdentityExpr} AS title,
            MIN(release_date) AS releaseDate,
            MIN(NULLIF(artwork_cache_key, '')) AS artworkCacheKey
         FROM library_track_display
         WHERE availability = 'available'
           AND ${albumArtistIdentityExpr} = ?
           AND ${albumTitleIdentityExpr} != ?
         GROUP BY ${albumArtistIdentityExpr}, ${albumTitleIdentityExpr}
         ORDER BY
           CASE WHEN MIN(release_date) IS NULL THEN 1 ELSE 0 END,
           MIN(release_date) ASC,
           title COLLATE NOCASE ASC`,
      )
      .all(albumArtist, excludeAlbumTitle) as AlbumDetailSummary[]
  }

  getGenreAlbumSummaries(
    genres: string[],
    excludeArtist: string,
    excludeTitle: string,
  ): AlbumDetailSummary[] {
    const genreKeys = new Set(genres.map(normalizeDelimitedValue).filter(Boolean))
    if (genreKeys.size === 0) return []

    const albums = this.db
      .prepare(
        `SELECT
            ${albumArtistIdentityExpr} AS albumArtist,
            ${albumTitleIdentityExpr} AS title,
            MIN(release_date) AS releaseDate,
            MIN(NULLIF(artwork_cache_key, '')) AS artworkCacheKey,
            json_group_array(DISTINCT genre) AS genres
         FROM library_track_display
         WHERE availability = 'available'
           AND NOT (${albumArtistIdentityExpr} = ? AND ${albumTitleIdentityExpr} = ?)
         GROUP BY ${albumArtistIdentityExpr}, ${albumTitleIdentityExpr}`,
      )
      .all(excludeArtist, excludeTitle) as (AlbumDetailSummary & { genres: string })[]

    return albums
      .filter((album) =>
        (JSON.parse(album.genres) as (string | null)[]).some((value) =>
          splitDelimitedValues(value).some((genre) =>
            genreKeys.has(normalizeDelimitedValue(genre)),
          ),
        ),
      )
      .map((album) => ({
        albumArtist: album.albumArtist,
        title: album.title,
        releaseDate: album.releaseDate,
        artworkCacheKey: album.artworkCacheKey,
      }))
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
                t.lyrics_sidecar_fingerprint AS lyricsSidecarFingerprint,
                t.metadata_checked_mtime_ms AS metadataCheckedMtimeMs
         FROM tracks t
         LEFT JOIN albums a ON t.album = a.title AND t.album_artist = a.artist`,
      )
      .all() as KnownTrackFile[]
  }

  getRandomPlayableTrack(excludeTrackId?: number): PlaybackTrackDto | null {
    const baseQuery = `
      SELECT id, title, artist, album,
             album_artist AS albumArtist,
             duration_seconds AS durationSeconds,
             artwork_cache_key AS artworkCacheKey
      FROM library_track_display
      WHERE availability = 'available'`

    if (excludeTrackId !== undefined) {
      const row = this.db
        .prepare(`${baseQuery} AND id != ? ORDER BY RANDOM() LIMIT 1`)
        .get(excludeTrackId) as PlaybackTrackDto | undefined

      if (row) return row
    }

    const row = this.db.prepare(`${baseQuery} ORDER BY RANDOM() LIMIT 1`).get() as
      | PlaybackTrackDto
      | undefined

    return row ?? null
  }

  getRandomAlbumIdentity(excludeAlbumKey?: {
    albumArtist: string
    album: string
  }): { albumArtist: string; album: string } | null {
    const albumArtistExpr = `COALESCE(NULLIF(album_artist, ''), artist)`

    const baseQuery = `
      SELECT ${albumArtistExpr} AS albumArtist, album
      FROM library_track_display
      WHERE availability = 'available'
        AND album IS NOT NULL
        AND album != ''
      GROUP BY ${albumArtistExpr}, album`

    if (excludeAlbumKey) {
      const row = this.db
        .prepare(
          `${baseQuery} HAVING NOT (${albumArtistExpr} = ? AND album = ?) ORDER BY RANDOM() LIMIT 1`,
        )
        .get(excludeAlbumKey.albumArtist, excludeAlbumKey.album) as
        | { albumArtist: string; album: string }
        | undefined

      if (row) return row
    }

    const row = this.db.prepare(`${baseQuery} ORDER BY RANDOM() LIMIT 1`).get() as
      | { albumArtist: string; album: string }
      | undefined

    return row ?? null
  }

  getAlbumTracks(albumArtist: string, album: string): PlaybackTrackDto[] {
    const albumArtistExpr = `COALESCE(NULLIF(album_artist, ''), artist)`

    return this.db
      .prepare(
        `SELECT id, title, artist, album,
                ${albumArtistExpr} AS albumArtist,
                duration_seconds AS durationSeconds,
                artwork_cache_key AS artworkCacheKey
         FROM library_track_display
         WHERE availability = 'available'
           AND ${albumArtistExpr} = ?
           AND album = ?
         ORDER BY
           CASE WHEN disc_no IS NULL THEN 1 ELSE 0 END,
           disc_no ASC,
           CASE WHEN track_no IS NULL THEN 1 ELSE 0 END,
           track_no ASC,
           title COLLATE NOCASE ASC,
           id ASC`,
      )
      .all(albumArtist, album) as PlaybackTrackDto[]
  }
}
