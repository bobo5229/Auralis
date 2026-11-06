import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { TrackQueryRepository } from '@main/repositories/trackQueryRepository'
import { ScanStagingRepository } from '@main/repositories/scanStagingRepository'
import { isCurrentArtworkCacheKey } from '@main/shared/artworkCachePolicy'
import { getMetadataParserVersion } from '../metadata/metadataParserVersion'
import { isCurrentScanSnapshot } from './libraryScanSnapshot'
import type { LibraryScanWorkerInput, ScannedTrackFile } from './libraryScanTypes'

/** Read-only, worker-owned lookup: no whole-library clone and no long read transaction. */
export function openScanReadSource(input: LibraryScanWorkerInput) {
  const db = new Database(input.databasePath!, {
    readonly: true,
    fileMustExist: true,
    timeout: 250,
  })
  const tracks = new TrackQueryRepository(db)
  const staging = new ScanStagingRepository(db)
  return {
    known: (path: string) => tracks.getKnownFile(path),
    cached: (path: string): ScannedTrackFile | undefined => {
      if (input.rootId === undefined) return
      const track = staging.readCached<ScannedTrackFile>(input.rootId, path)
      if (
        !track ||
        track.metadataParserVersion !== getMetadataParserVersion(path) ||
        track.artworkRead?.status === 'error'
      )
        return
      if (!isCurrentScanSnapshot(track, true)) return
      for (const key of [track.artworkCacheKey, track.directoryArtworkCacheKey]) {
        if (
          key &&
          (!isCurrentArtworkCacheKey(key) || !existsSync(join(input.artworkCacheDir, key)))
        )
          return
      }
      return track
    },
    close: (): void => {
      db.close()
    },
  }
}
