import type { TrackListItem } from '@shared/types/libraryScan'
import type {
  AddPlaylistTracksResult,
  Playlist,
  PlaylistViewMode,
  SidebarPlaylistKind,
} from '@shared/types/playlist'
import { BaseRepository } from './baseRepository'

interface PlaylistRow {
  id: number
  name: string
  viewMode: PlaylistViewMode
  sortOrder: number
  createdAt: string
  updatedAt: string
}

function toPlaylist(row: PlaylistRow): Playlist {
  return {
    id: row.id,
    name: row.name,
    viewMode: row.viewMode,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class PlaylistRepository extends BaseRepository {
  list(): Playlist[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, view_mode AS viewMode,
                sort_order AS sortOrder,
                created_at AS createdAt, updated_at AS updatedAt
         FROM playlists
         ORDER BY sort_order ASC, id ASC`,
      )
      .all() as PlaylistRow[]

    return rows.map(toPlaylist)
  }

  getById(id: number): Playlist | null {
    const row = this.db
      .prepare(
        `SELECT id, name, view_mode AS viewMode,
                sort_order AS sortOrder,
                created_at AS createdAt, updated_at AS updatedAt
         FROM playlists
         WHERE id = ?`,
      )
      .get(id) as PlaylistRow | undefined

    return row ? toPlaylist(row) : null
  }

  getTrackIds(id: number): number[] {
    const rows = this.db
      .prepare(
        `SELECT track_id AS trackId
         FROM playlist_tracks
         WHERE playlist_id = ?
         ORDER BY position ASC, track_id ASC`,
      )
      .all(id) as Array<{ trackId: number }>

    return rows.map((row) => row.trackId)
  }

  /** Available playlist tracks with library display fields, ordered by position. */
  getTracks(id: number): TrackListItem[] {
    return this.db
      .prepare(
        `SELECT d.id, d.title, d.artist, d.album,
                d.album_artist AS albumArtist,
                d.track_no AS trackNo,
                d.disc_no AS discNo,
                d.release_date AS releaseDate,
                d.copyright,
                d.composer,
                d.duration_seconds AS durationSeconds,
                d.bitrate_bps AS bitrateBps,
                d.artwork_cache_key AS artworkCacheKey,
                d.genre,
                d.availability,
                d.play_count AS playCount,
                d.last_played_at AS lastPlayedAt,
                d.created_at AS createdAt
         FROM playlist_tracks pt
         INNER JOIN library_track_display d ON d.id = pt.track_id
         WHERE pt.playlist_id = ?
           AND d.availability = 'available'
         ORDER BY pt.position ASC, pt.track_id ASC`,
      )
      .all(id) as TrackListItem[]
  }

  getTrackCounts(): PlaylistTrackCountRow[] {
    return this.db
      .prepare(
        `SELECT p.id AS playlistId, COUNT(t.id) AS trackCount
         FROM playlists p
         LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
         LEFT JOIN tracks t ON t.id = pt.track_id AND t.availability = 'available'
         GROUP BY p.id`,
      )
      .all() as PlaylistTrackCountRow[]
  }

  addTracks(playlistId: number, trackIds: number[]): AddPlaylistTracksResult {
    const uniqueTrackIds = [...new Set(trackIds)].filter((trackId) => Number.isInteger(trackId))
    const addBatch = this.db.transaction((): AddPlaylistTracksResult => {
      const result = {
        addedCount: 0,
        alreadyPresentCount: 0,
        unavailableCount: 0,
        playlistExists: this.getById(playlistId) !== null,
      }
      if (!result.playlistExists) return result

      const currentMaxPosition =
        (this.db
          .prepare('SELECT MAX(position) FROM playlist_tracks WHERE playlist_id = ?')
          .pluck()
          .get(playlistId) as number | null) ?? -1
      const available = this.db.prepare(
        "SELECT id FROM tracks WHERE id = ? AND availability = 'available'",
      )
      const insert = this.db.prepare(
        `INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)
         ON CONFLICT(playlist_id, track_id) DO NOTHING`,
      )
      for (const trackId of uniqueTrackIds) {
        if (!available.get(trackId)) {
          result.unavailableCount++
          continue
        }
        const changes = insert.run(
          playlistId,
          trackId,
          currentMaxPosition + result.addedCount + 1,
        ).changes
        if (changes > 0) result.addedCount++
        else result.alreadyPresentCount++
      }
      return result
    })
    return addBatch.immediate()
  }

  /** Validate and update both sidebar tables while holding one write transaction. */
  reorderSidebarItems(items: Array<{ kind: SidebarPlaylistKind; id: number }>): void {
    this.db
      .transaction(() => {
        const existing = this.db
          .prepare(
            `SELECT 'playlist' AS kind, id FROM playlists
         UNION ALL SELECT 'smart' AS kind, id FROM smart_playlists`,
          )
          .all() as Array<{ kind: SidebarPlaylistKind; id: number }>
        const key = (item: { kind: SidebarPlaylistKind; id: number }) => `${item.kind}:${item.id}`
        const existingKeys = new Set(existing.map(key))
        const requestedKeys = new Set(items.map(key))
        if (
          items.length !== existing.length ||
          requestedKeys.size !== items.length ||
          items.some((item) => !existingKeys.has(key(item)))
        )
          return

        const regularUpdate = this.db.prepare(
          'UPDATE playlists SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        )
        const smartUpdate = this.db.prepare(
          'UPDATE smart_playlists SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        )
        items.forEach((item, index) => {
          const update = item.kind === 'playlist' ? regularUpdate : smartUpdate
          update.run(index, item.id)
        })
      })
      .immediate()
  }

  create(name: string, sortOrder: number): Playlist {
    const result = this.db
      .prepare(
        `INSERT INTO playlists (name, view_mode, sort_order)
         VALUES (?, 'cover', ?)`,
      )
      .run(name, sortOrder)

    return this.getById(Number(result.lastInsertRowid))!
  }

  rename(id: number, name: string): Playlist | null {
    this.db
      .prepare(
        `UPDATE playlists
         SET name = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .run(name, id)

    return this.getById(id)
  }

  updateViewMode(id: number, viewMode: PlaylistViewMode): Playlist | null {
    this.db
      .prepare(
        `UPDATE playlists
         SET view_mode = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .run(viewMode, id)

    return this.getById(id)
  }

  delete(id: number): boolean {
    return this.db.prepare('DELETE FROM playlists WHERE id = ?').run(id).changes > 0
  }

  setSortOrder(id: number, sortOrder: number): void {
    this.db
      .prepare(
        `UPDATE playlists
         SET sort_order = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .run(sortOrder, id)
  }
}

interface PlaylistTrackCountRow {
  playlistId: number
  trackCount: number
}
