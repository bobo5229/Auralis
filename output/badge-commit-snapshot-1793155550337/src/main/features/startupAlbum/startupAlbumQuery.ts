import type Database from 'better-sqlite3'
import { TrackQueryRepository } from '@main/repositories/trackQueryRepository'
import { selectStartupAlbum } from '@main/services/startupAlbumSelection'
import type { StartupAlbumHistory } from '@shared/types/startupAlbum'
import type { RandomAlbumTracksResult } from '@shared/types/playback'

/** Run only on the query worker; one read transaction keeps selection and tracks consistent. */
export function queryStartupAlbum(
  db: Database.Database,
  history: StartupAlbumHistory = [],
): RandomAlbumTracksResult | null {
  return db.transaction(() => {
    const tracks = new TrackQueryRepository(db)
    const identity = selectStartupAlbum(tracks.getStartupAlbumCandidates(), history)
    if (!identity) return null
    const albumTracks = tracks.getAlbumTracks(identity.albumArtist, identity.album)
    return albumTracks.length ? { ...identity, tracks: albumTracks } : null
  })()
}
