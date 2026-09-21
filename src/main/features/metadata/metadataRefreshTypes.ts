import type { RefreshedTrackMetadata } from '../../repositories/metadataRefreshRepository'

export interface MetadataRefreshWorkerInput {
  jobId: number
  tracks: Array<{ trackId: number; filePath: string; generation?: number }>
  artworkCacheDir: string
  writeMode?: 'metadata' | 'lyrics'
}

export interface MetadataRefreshWorkerResult extends RefreshedTrackMetadata {
  jobId: number
  generation: number
}

export type MetadataRefreshWorkerMessage =
  | { type: 'result'; payload: MetadataRefreshWorkerResult }
  | {
      type: 'failure'
      payload: { jobId: number; trackId: number; filePath: string; reason: string }
    }
  | { type: 'progress'; payload: { jobId: number; processed: number; failed: number } }
  | { type: 'complete' }
  | { type: 'fatal'; payload: { jobId: number; reason: string } }
