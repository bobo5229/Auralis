import type {
  SmartPlaylist,
  SmartPlaylistRule,
  SmartPlaylistViewMode,
} from '@shared/types/smartPlaylist'
import { BaseRepository } from './baseRepository'

interface SmartPlaylistRow {
  id: number
  name: string
  ruleJson: string
  viewMode: SmartPlaylistViewMode
  sortOrder: number
  createdAt: string
  updatedAt: string
}

function toSmartPlaylist(row: SmartPlaylistRow): SmartPlaylist {
  return {
    id: row.id,
    name: row.name,
    rule: JSON.parse(row.ruleJson) as SmartPlaylistRule,
    viewMode: row.viewMode,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class SmartPlaylistRepository extends BaseRepository {
  list(): SmartPlaylist[] {
    const rows = this.db
      .prepare(
        `SELECT id, name, rule_json AS ruleJson, view_mode AS viewMode,
                sort_order AS sortOrder,
                created_at AS createdAt, updated_at AS updatedAt
         FROM smart_playlists
         ORDER BY sort_order ASC, id ASC`,
      )
      .all() as SmartPlaylistRow[]

    return rows.map(toSmartPlaylist)
  }

  getById(id: number): SmartPlaylist | null {
    const row = this.db
      .prepare(
        `SELECT id, name, rule_json AS ruleJson, view_mode AS viewMode,
                sort_order AS sortOrder,
                created_at AS createdAt, updated_at AS updatedAt
         FROM smart_playlists
         WHERE id = ?`,
      )
      .get(id) as SmartPlaylistRow | undefined

    return row ? toSmartPlaylist(row) : null
  }

  create(name: string, rule: SmartPlaylistRule): SmartPlaylist {
    // Cross-table max so smart + regular playlists share one sidebar sort space
    const result = this.db
      .prepare(
        `INSERT INTO smart_playlists (name, rule_json, sort_order)
         VALUES (
           ?,
           ?,
           COALESCE(
             (
               SELECT MAX(sort_order) + 1
               FROM (
                 SELECT sort_order FROM smart_playlists
                 UNION ALL
                 SELECT sort_order FROM playlists
               ) AS sidebar_orders
             ),
             0
           )
         )`,
      )
      .run(name, JSON.stringify(rule))

    return this.getById(Number(result.lastInsertRowid))!
  }

  rename(id: number, name: string): SmartPlaylist | null {
    this.db
      .prepare(
        `UPDATE smart_playlists
         SET name = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .run(name, id)

    return this.getById(id)
  }

  updateRule(id: number, rule: SmartPlaylistRule): SmartPlaylist | null {
    this.db
      .prepare(
        `UPDATE smart_playlists SET rule_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .run(JSON.stringify(rule), id)
    return this.getById(id)
  }

  getRecentFrequentTrackIds(startDate: string, endDate: string): number[] {
    const rows = this.db
      .prepare(
        `SELECT track_id AS trackId
       FROM daily_track_play_stats
       WHERE play_date BETWEEN ? AND ?
       GROUP BY track_id
       HAVING SUM(play_count) > 0
       ORDER BY SUM(play_count) DESC, MAX(julianday(last_played_at)) DESC, track_id ASC`,
      )
      .all(startDate, endDate) as Array<{ trackId: number }>
    return rows.map((row) => row.trackId)
  }

  getRecentPlayedTrackIds(startDate: string, endDate: string): number[] {
    const rows = this.db
      .prepare(
        `SELECT track_id AS trackId FROM daily_track_play_stats
       WHERE play_date BETWEEN ? AND ?
       GROUP BY track_id HAVING SUM(play_count) > 0
       ORDER BY MAX(julianday(last_played_at)) DESC, track_id ASC`,
      )
      .all(startDate, endDate) as Array<{ trackId: number }>
    return rows.map((row) => row.trackId)
  }

  getMostListenedTrackIds(): number[] {
    const rows = this.db
      .prepare(
        `SELECT track_id AS trackId FROM track_play_stats
       WHERE play_count > 0
       ORDER BY play_count DESC, julianday(last_played_at) DESC, track_id ASC`,
      )
      .all() as Array<{ trackId: number }>
    return rows.map((row) => row.trackId)
  }

  updateViewMode(id: number, viewMode: SmartPlaylistViewMode): SmartPlaylist | null {
    this.db
      .prepare(
        `UPDATE smart_playlists
         SET view_mode = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .run(viewMode, id)

    return this.getById(id)
  }

  delete(id: number): boolean {
    return this.db.prepare('DELETE FROM smart_playlists WHERE id = ?').run(id).changes > 0
  }

  reorder(ids: number[]): SmartPlaylist[] {
    const update = this.db.prepare(
      `UPDATE smart_playlists
       SET sort_order = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    const reorderAll = this.db.transaction((orderedIds: number[]) => {
      orderedIds.forEach((id, index) => update.run(index, id))
    })

    reorderAll(ids)
    return this.list()
  }

  setSortOrder(id: number, sortOrder: number): void {
    this.db
      .prepare(
        `UPDATE smart_playlists
         SET sort_order = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .run(sortOrder, id)
  }
}
