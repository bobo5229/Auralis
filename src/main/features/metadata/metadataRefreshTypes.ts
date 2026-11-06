import type { RefreshedTrackMetadata } from '../../repositories/metadataRefreshRepository'
import type { ScanFileFingerprint } from '../libraryScan/libraryScanTypes'

export interface MetadataRefreshProgress {
  jobId: number
  status: 'running' | 'completed' | 'failed'
  totalTracks: number
  processedTracks: number
  failedTracks: number
}

export interface StableTrackMetadata extends RefreshedTrackMetadata {
  fileFingerprint: ScanFileFingerprint
  lyricsSidecarFingerprint?: string
}

export interface MetadataRefreshWorkerInput {
  jobId: number
  tracks: Array<{ trackId: number; filePath: string }>
  artworkCacheDir: string
  writeMode?: 'metadata' | 'lyrics' | 'legacy-ttml'
  messageCredits?: SharedArrayBuffer
}

export interface MetadataRefreshWorkerResult extends StableTrackMetadata {
  jobId: number
  lyricsSidecarFingerprint?: string
}

type MetadataRefreshMessage =
  | { type: 'result'; payload: MetadataRefreshWorkerResult }
  | {
      type: 'failure'
      payload: { jobId: number; trackId: number; filePath: string; reason: string }
    }
  | { type: 'progress'; payload: { jobId: number; processed: number; failed: number } }
  | { type: 'complete' }
  | { type: 'fatal'; payload: { jobId: number; reason: string } }

export type MetadataRefreshWorkerMessage = MetadataRefreshMessage & { sequence?: number }
