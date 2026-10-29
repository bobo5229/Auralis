import type Database from 'better-sqlite3'
import type { FileMetadataSnapshot } from '@shared/types/trackMetadata'
import { encodeScanFileFingerprint } from '@shared/utils/trackFileFingerprint'

export interface ArtworkAlbumIdentity {
  album: string
  artist: string
}
export function captureArtworkAlbum(
  db: Database.Database,
  trackId: number,
): ArtworkAlbumIdentity | undefined {
  const row = db
    .prepare(
      `SELECT COALESCE(NULLIF(album,''),'Unknown Album') AS album,
    COALESCE(NULLIF(album_artist,''),NULLIF(artist,''),'Unknown Artist') AS artist
    FROM library_track_display WHERE id=?`,
    )
    .get(trackId) as ArtworkAlbumIdentity | undefined
  return row
}

const artworkAlbumMembers = `FROM tracks t
    WHERE t.effective_album_title=?
      AND t.effective_album_artist=?
      AND t.availability='available'`

export function selectArtworkAlbumCandidate(
  db: Database.Database,
  identity: ArtworkAlbumIdentity,
  excludeTrackId?: number,
): string | null {
  const candidate = db
    .prepare(
      `SELECT COALESCE(t.embedded_artwork_cache_key,t.directory_artwork_cache_key) AS key ${artworkAlbumMembers}
    AND COALESCE(t.embedded_artwork_cache_key,t.directory_artwork_cache_key) IS NOT NULL
    ${excludeTrackId !== undefined ? 'AND t.id!=?' : ''}
    ORDER BY COALESCE(t.disc_no,1), t.track_no IS NULL, t.track_no, t.id LIMIT 1`,
    )
    .get(
      identity.album,
      identity.artist,
      ...(excludeTrackId !== undefined ? [excludeTrackId] : []),
    ) as { key: string } | undefined
  return candidate?.key ?? null
}

export function refreshArtworkAlbum(db: Database.Database, identity: ArtworkAlbumIdentity): void {
  const members = artworkAlbumMembers
  const candidate = selectArtworkAlbumCandidate(db, identity)
  if (candidate !== null) {
    db.prepare(
      `INSERT INTO albums(title,artist,artwork_cache_key) VALUES(?,?,?)
      ON CONFLICT(title,artist) DO UPDATE SET artwork_cache_key=excluded.artwork_cache_key`,
    ).run(identity.album, identity.artist, candidate)
  } else {
    if (!db.prepare(`SELECT 1 ${members} LIMIT 1`).get(identity.album, identity.artist)) return
    const pending = db
      .prepare(`SELECT 1 ${members} AND t.embedded_artwork_checked_fingerprint IS NULL LIMIT 1`)
      .get(identity.album, identity.artist)
    if (!pending)
      db.prepare(`UPDATE albums SET artwork_cache_key=NULL WHERE title=? AND artist=?`).run(
        identity.album,
        identity.artist,
      )
  }
}

export function commitArtworkProjection(
  db: Database.Database,
  trackId: number,
  state: FileMetadataSnapshot,
  previous?: ArtworkAlbumIdentity,
): void {
  const read = state.artworkRead
  if (read?.status === 'present' || read?.status === 'absent') {
    const fingerprint = encodeScanFileFingerprint(state.fileFingerprint)
    // A reader without a stable fingerprint cannot establish a new artwork baseline.
    if (fingerprint) {
      db.prepare(
        `UPDATE tracks SET embedded_artwork_cache_key=?,directory_artwork_cache_key=?,
        embedded_artwork_checked_fingerprint=?,directory_artwork_checked_fingerprint=? WHERE id=?`,
      ).run(
        read.status === 'present' ? read.cacheKey : null,
        state.directoryArtworkCacheKey ?? null,
        fingerprint,
        state.directoryArtworkFingerprint ?? null,
        trackId,
      )
      db.prepare(`UPDATE track_metadata SET artwork_cache_key=NULL WHERE track_id=?`).run(trackId)
    }
  } else if (read?.status === 'error') {
    db.prepare(`UPDATE tracks SET embedded_artwork_checked_fingerprint=NULL WHERE id=?`).run(
      trackId,
    )
  }
  const current = captureArtworkAlbum(db, trackId)
  if (current)
    db.prepare(`UPDATE tracks SET effective_album_title=?,effective_album_artist=? WHERE id=?`).run(
      current.album,
      current.artist,
      trackId,
    )
  if (
    previous &&
    (!current || previous.album !== current.album || previous.artist !== current.artist)
  )
    refreshArtworkAlbum(db, previous)
  if (current) refreshArtworkAlbum(db, current)
}
