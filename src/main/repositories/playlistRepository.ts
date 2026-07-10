import type { Playlist, PlaylistViewMode } from '@shared/types/playlist'
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

  addTracks(playlistId: number, trackIds: number[]): number {
    const uniqueTrackIds = [...new Set(trackIds)].filter((trackId) => Number.isInteger(trackId))
    if (uniqueTrackIds.length === 0) return 0

    const currentMaxPosition =
      (this.db
        .prepare(
          `SELECT MAX(position)
           FROM playlist_tracks
           WHERE playlist_id = ?`,
        )
        .pluck()
        .get(playlistId) as number | null) ?? -1

    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position)
       SELECT ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM tracks
         WHERE id = ?
           AND availability = 'available'
       )`,
    )
    const addBatch = this.db.transaction((ids: number[]) => {
      let addedCount = 0
      ids.forEach((trackId, index) => {
        addedCount += insert.run(
          playlistId,
          trackId,
          currentMaxPosition + index + 1,
          trackId,
        ).changes
      })
      return addedCount
    })

    return addBatch(uniqueTrackIds)
  }

  create(name: string, sortOrder: number): Playlist {
    const result = this.db
      .prepare(
        `INSERT INTO playlists (name, sort_order)
         VALUES (?, ?)`,
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
