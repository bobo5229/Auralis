import type {
  AlbumArtworkPatch,
  LibraryScanProgress,
  ScanFailure,
  ScannedTrack,
} from '@shared/types/libraryScan'
import type { KnownTrackFile } from '@main/repositories/trackRepository'

export interface LibraryScanWorkerInput {
  jobId: number
  rootPath: string
  knownFiles: KnownTrackFile[]
  artworkCacheDir: string
}

export type LibraryScanWorkerMessage =
  | { type: 'progress'; payload: LibraryScanProgress }
  | { type: 'tracks'; payload: ScannedTrack[] }
  | { type: 'albumArtwork'; payload: AlbumArtworkPatch[] }
  | { type: 'failure'; payload: ScanFailure }
  | { type: 'fatal'; payload: { jobId: number; reason: string } }
  | { type: 'complete' }
