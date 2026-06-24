import type { AppInfo, LibraryStats } from '@shared/types/app'
import type {
  LibraryRoot,
  LibraryScanStatus,
  SelectLibraryRootResult,
  TrackListItem,
  TrackLyrics,
  MetadataRefreshFailure,
  EditableTrackMetadata,
} from '@shared/types/libraryScan'

export interface IpcInvokeContract {
  'app:get-info': {
    request: void
    response: AppInfo
  }
  'library:get-stats': {
    request: void
    response: LibraryStats
  }
  'library:select-root': {
    request: void
    response: SelectLibraryRootResult
  }
  'library:get-roots': {
    request: void
    response: LibraryRoot[]
  }
  'library:start-scan': {
    request: { rootId: number }
    response: { jobId: number }
  }
  'library:cancel-scan': {
    request: { jobId: number }
    response: { ok: boolean }
  }
  'library:get-scan-status': {
    request: { jobId?: number } | void
    response: LibraryScanStatus | null
  }
  'library:get-tracks': {
    request: void
    response: TrackListItem[]
  }
  'lyrics:get-by-track-id': {
    request: { trackId: number }
    response: TrackLyrics | null
  }
  'metadata:refresh-track': {
    request: { trackId: number }
    response: { jobId: number }
  }
  'metadata:refresh-tracks': {
    request: { trackIds: number[] }
    response: { jobId: number }
  }
  'metadata:refresh-missing': {
    request: { limit?: number }
    response: { jobId: number }
  }
  'metadata:refresh-lyrics-missing': {
    request: { limit?: number }
    response: { jobId: number }
  }
  'metadata:get-refresh-status': {
    request: { jobId: number }
    response: {
      id: number
      scope: string
      status: string
      totalTracks: number
      processedTracks: number
      failedTracks: number
      startedAt: string
      finishedAt: string | null
      errorMessage: string | null
    } | null
  }
  'metadata:list-refresh-failures': {
    request: { limit?: number } | void
    response: MetadataRefreshFailure[]
  }
  'metadata:get-track-metadata': {
    request: { trackId: number }
    response: EditableTrackMetadata | null
  }
  'metadata:update-track-metadata': {
    request: EditableTrackMetadata
    response: { ok: boolean }
  }
}

export type IpcInvokeChannel = keyof IpcInvokeContract

export type IpcRequest<TChannel extends IpcInvokeChannel> = IpcInvokeContract[TChannel]['request']

export type IpcResponse<TChannel extends IpcInvokeChannel> = IpcInvokeContract[TChannel]['response']
