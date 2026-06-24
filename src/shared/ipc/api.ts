import type { AppInfo, LibraryStats } from '@shared/types/app'
import type {
  LibraryRoot,
  LibraryScanProgress,
  LibraryScanStatus,
  SelectLibraryRootResult,
  TrackListItem,
  TrackLyrics,
  MetadataRefreshFailure,
  EditableTrackMetadata,
} from '@shared/types/libraryScan'

export interface AuralisApi {
  app: {
    getInfo: () => Promise<AppInfo>
    rendererReady: () => void
  }
  library: {
    getStats: () => Promise<LibraryStats>
    selectRoot: () => Promise<SelectLibraryRootResult>
    getRoots: () => Promise<LibraryRoot[]>
    startScan: (rootId: number) => Promise<{ jobId: number }>
    cancelScan: (jobId: number) => Promise<{ ok: boolean }>
    getScanStatus: (jobId?: number) => Promise<LibraryScanStatus | null>
    getTracks: () => Promise<TrackListItem[]>
    onScanProgress: (callback: (progress: LibraryScanProgress) => void) => () => void
    onChanged: (
      callback: (event: {
        reason:
          | 'track-added'
          | 'track-missing'
          | 'track-restored'
          | 'track-relocated'
          | 'metadata-refresh'
          | 'file-change'
        trackIds: number[]
        filePaths: string[]
      }) => void,
    ) => () => void
  }
  lyrics: {
    getByTrackId: (trackId: number) => Promise<TrackLyrics | null>
  }
  metadata: {
    refreshTrack: (trackId: number) => Promise<{ jobId: number }>
    refreshTracks: (trackIds: number[]) => Promise<{ jobId: number }>
    refreshMissing: (limit?: number) => Promise<{ jobId: number }>
    refreshLyricsMissing: (limit?: number) => Promise<{ jobId: number }>
    getRefreshStatus: (jobId: number) => Promise<{
      id: number
      scope: string
      status: string
      totalTracks: number
      processedTracks: number
      failedTracks: number
      startedAt: string
      finishedAt: string | null
      errorMessage: string | null
    } | null>
    listRefreshFailures: (limit?: number) => Promise<MetadataRefreshFailure[]>
    getTrackMetadata: (trackId: number) => Promise<EditableTrackMetadata | null>
    updateTrackMetadata: (metadata: EditableTrackMetadata) => Promise<{ ok: boolean }>
    onRefreshProgress: (
      callback: (progress: {
        jobId: number
        status: string
        totalTracks: number
        processedTracks: number
        failedTracks: number
      }) => void,
    ) => () => void
  }
}
