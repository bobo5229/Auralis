import type { LibraryScanProgress, ScanFailure, ScannedTrack } from '@shared/types/libraryScan'
import type { KnownTrackFile } from '@main/repositories/trackRepository'

export interface LibraryScanWorkerInput {
  jobId: number
  rootPath: string
  knownFiles: KnownTrackFile[]
}

export type LibraryScanWorkerMessage =
  | { type: 'progress'; payload: LibraryScanProgress }
  | { type: 'tracks'; payload: ScannedTrack[] }
  | { type: 'failure'; payload: ScanFailure }
  | { type: 'fatal'; payload: { jobId: number; reason: string } }
  | { type: 'complete' }
