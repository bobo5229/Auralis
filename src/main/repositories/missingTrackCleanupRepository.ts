import { statSync } from 'node:fs'
import { win32 } from 'node:path'
import { BaseRepository } from './baseRepository'
import type { MissingTrackCandidate } from './trackRepository'
import { TrackRepository } from './trackRepository'
import { findUniqueRelocationCandidate } from '@main/features/libraryScan/trackRelocationMatcher'
import type { FileIdentity } from '@main/features/libraryScan/trackRelocationMatcher'

function underRoot(path: string, root: string): boolean {
  const relative = win32.relative(root, path)
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith('..\\') &&
    !win32.isAbsolute(relative)
  )
}

/** Called only after a successful complete inventory and relocation, in its commit transaction. */
export class MissingTrackCleanupRepository extends BaseRepository {
  removeConfirmedMissing(rootPath: string): number[] {
    if (!this.db.inTransaction) throw new Error('Missing-track cleanup requires a transaction')
    try {
      if (!statSync(rootPath).isDirectory()) return []
    } catch {
      return []
    }
    const candidates = new TrackRepository(this.db)
      .getMissingCandidates()
      .filter((c) => underRoot(c.filePath, rootPath))
    const possibleMoves = this.findPossibleMoves(candidates)
    const removed: number[] = []
    const affectedAlbums = new Set<number>()
    const affectedArtists = new Set<number>()
    for (const candidate of candidates) {
      if (!this.isAbsent(candidate.filePath) || possibleMoves.has(candidate.trackId)) continue
      const row = this.db
        .prepare("SELECT * FROM tracks WHERE id=? AND availability='missing' AND file_path=?")
        .get(candidate.trackId, candidate.filePath)
      if (!row) continue
      const stored = row as {
        album: string | null
        album_artist: string | null
        artist: string | null
      }
      const display = this.db
        .prepare('SELECT * FROM library_track_display WHERE id=?')
        .get(candidate.trackId) as {
        title: string | null
        artist: string | null
        album: string | null
        album_artist: string | null
        genre: string | null
        artwork_cache_key: string | null
        play_count: number
        last_played_at: string | null
      }
      const snapshot = {
        track: row,
        metadata:
          this.db.prepare('SELECT * FROM track_metadata WHERE track_id=?').get(candidate.trackId) ??
          null,
        artists: this.db
          .prepare('SELECT * FROM track_artists WHERE track_id=?')
          .all(candidate.trackId),
        playlists: this.db
          .prepare('SELECT * FROM playlist_tracks WHERE track_id=?')
          .all(candidate.trackId),
        stats:
          this.db
            .prepare('SELECT * FROM track_play_stats WHERE track_id=?')
            .get(candidate.trackId) ?? null,
        dailyStats: this.db
          .prepare('SELECT * FROM daily_track_play_stats WHERE track_id=?')
          .all(candidate.trackId),
      }
      const albumRows = this.db
        .prepare(
          "SELECT * FROM albums WHERE (title=? AND artist=COALESCE(NULLIF(?,''),?)) OR (title=? AND artist=COALESCE(NULLIF(?,''),?))",
        )
        .all(
          display.album,
          display.album_artist,
          display.artist,
          stored.album,
          stored.album_artist,
          stored.artist,
        ) as Array<{ id: number }>
      const artistRows = this.db
        .prepare(
          'SELECT a.* FROM artists a JOIN track_artists ta ON ta.artist_id=a.id WHERE ta.track_id=?',
        )
        .all(candidate.trackId) as Array<{ id: number }>
      for (const album of albumRows) affectedAlbums.add(album.id)
      for (const artist of artistRows) affectedArtists.add(artist.id)
      this.db
        .prepare(
          `INSERT INTO removed_track_history(id,title,artist,album,album_artist,genre,artwork_cache_key,source_file_path,play_count,last_played_at,recovery_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          candidate.trackId,
          display.title,
          display.artist,
          display.album,
          display.album_artist,
          display.genre,
          display.artwork_cache_key,
          candidate.filePath,
          display.play_count,
          display.last_played_at,
          JSON.stringify({ ...snapshot, albumRows, artistRows }),
        )
      this.db
        .prepare(
          'INSERT INTO removed_daily_track_play_stats SELECT * FROM daily_track_play_stats WHERE track_id=?',
        )
        .run(candidate.trackId)
      // Explicitly remove dependents as well as relying on cascades, so cleanup is
      // safe in isolated connections with foreign_keys disabled.
      for (const table of [
        'track_artists',
        'track_metadata',
        'playlist_tracks',
        'track_play_stats',
        'daily_track_play_stats',
      ])
        this.db.prepare(`DELETE FROM ${table} WHERE track_id=?`).run(candidate.trackId)
      const deletion = this.db
        .prepare("DELETE FROM tracks WHERE id=? AND availability='missing' AND file_path=?")
        .run(candidate.trackId, candidate.filePath)
      if (deletion.changes !== 1) throw new Error('Missing track changed during cleanup')
      removed.push(candidate.trackId)
    }
    if (removed.length) {
      const deleteAlbum = this.db.prepare(
        `DELETE FROM albums WHERE id=? AND NOT EXISTS(SELECT 1 FROM library_track_display d WHERE d.album=albums.title AND COALESCE(NULLIF(d.album_artist,''),d.artist)=albums.artist)`,
      )
      for (const id of affectedAlbums) deleteAlbum.run(id)
      const deleteArtist = this.db.prepare(
        'DELETE FROM artists WHERE id=? AND NOT EXISTS(SELECT 1 FROM track_artists ta WHERE ta.artist_id=artists.id)',
      )
      for (const id of affectedArtists) deleteArtist.run(id)
    }
    return removed
  }

  private isAbsent(filePath: string): boolean {
    try {
      statSync(filePath)
      return false
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      return code === 'ENOENT' || code === 'ENOTDIR'
    }
  }

  private findPossibleMoves(candidates: MissingTrackCandidate[]): Set<number> {
    const byIsrc = new Map<string, MissingTrackCandidate[]>()
    const byTitleAndArtist = new Map<string, Map<string, MissingTrackCandidate[]>>()
    for (const candidate of candidates) {
      if (candidate.isrc) {
        const group = byIsrc.get(candidate.isrc) ?? []
        group.push(candidate)
        byIsrc.set(candidate.isrc, group)
      } else if (candidate.title !== null && candidate.artist !== null) {
        // Preserve SQL '=' semantics: null titles/artists cannot match by identity.
        const artists = byTitleAndArtist.get(candidate.title) ?? new Map()
        const group = artists.get(candidate.artist) ?? []
        group.push(candidate)
        artists.set(candidate.artist, group)
        byTitleAndArtist.set(candidate.title, artists)
      }
    }
    const possibleMoves = new Set<number>()
    if (!byIsrc.size && !byTitleAndArtist.size) return possibleMoves

    // Traverse available identities once, retaining only matching missing IDs.
    // Keep the singleton check: ambiguous moves must protect every old record.
    const identities = this.db
      .prepare(
        `SELECT title,artist,album,isrc,duration_seconds AS durationSeconds,file_size AS fileSize FROM tracks WHERE availability='available'`,
      )
      .iterate() as Iterable<FileIdentity>
    for (const identity of identities) {
      const groups = [
        identity.isrc ? byIsrc.get(identity.isrc) : undefined,
        byTitleAndArtist.get(identity.title)?.get(identity.artist),
      ]
      for (const group of groups) {
        if (!group) continue
        for (const candidate of group) {
          if (
            !possibleMoves.has(candidate.trackId) &&
            findUniqueRelocationCandidate([candidate], identity)
          )
            possibleMoves.add(candidate.trackId)
        }
      }
    }
    return possibleMoves
  }
}
