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
import type { PlaybackTrackDto, RandomAlbumTracksResult } from '@shared/types/playback'
import type {
  AnnualListeningInsights,
  DailyListeningDetail,
  ListeningRanking,
  ListeningRankingParams,
  ListeningHeatmap,
} from '@shared/types/archive'
import type {
  CreateSmartPlaylistResult,
  SmartPlaylist,
  SmartPlaylistDetail,
  SmartPlaylistRule,
  SmartPlaylistViewMode,
} from '@shared/types/smartPlaylist'

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
  'smart-playlists:list': {
    request: void
    response: SmartPlaylist[]
  }
  'smart-playlists:get-detail': {
    request: { id: number }
    response: SmartPlaylistDetail | null
  }
  'smart-playlists:create': {
    request: { name: string; rule: SmartPlaylistRule }
    response: CreateSmartPlaylistResult
  }
  'smart-playlists:rename': {
    request: { id: number; name: string }
    response: SmartPlaylist | null
  }
  'smart-playlists:update-view-mode': {
    request: { id: number; viewMode: SmartPlaylistViewMode }
    response: SmartPlaylist | null
  }
  'smart-playlists:delete': {
    request: { id: number }
    response: { deleted: boolean }
  }
  'smart-playlists:reorder': {
    request: { ids: number[] }
    response: SmartPlaylist[]
  }
  'lyrics:get-by-track-id': {
    request: { trackId: number }
    response: TrackLyrics | null
  }
  'playback:get-audio-url': {
    request: { trackId: number }
    response: { url: string } | null
  }
  'playback:get-random-track': {
    request: { excludeTrackId?: number } | void
    response: PlaybackTrackDto | null
  }
  'playback:get-random-album-tracks': {
    request: { excludeAlbumKey?: { albumArtist: string; album: string } } | void
    response: RandomAlbumTracksResult | null
  }
  'playback:get-album-tracks': {
    request: { albumKey: { albumArtist: string; album: string } }
    response: RandomAlbumTracksResult | null
  }
  'playback:record-effective-play': {
    request: { trackId: number; sessionId: string; playedAtIso: string }
    response: { ok: boolean }
  }
  'archive:get-listening-heatmap': {
    request: { year: number }
    response: ListeningHeatmap
  }
  'archive:get-daily-listening-detail': {
    request: { date: string }
    response: DailyListeningDetail
  }
  'archive:get-annual-listening-insights': {
    request: { year: number }
    response: AnnualListeningInsights
  }
  'archive:get-listening-ranking': {
    request: ListeningRankingParams
    response: ListeningRanking
  }
  'archive:reset-play-stats': {
    request: void
    response: { ok: true }
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
  'metadata:clear-refresh-failures': {
    request: void
    response: { deletedCount: number }
  }
  'metadata:get-track-metadata': {
    request: { trackId: number }
    response: EditableTrackMetadata | null
  }
  'metadata:update-track-metadata': {
    request: EditableTrackMetadata
    response: { ok: boolean }
  }
  'window:minimize': {
    request: void
    response: { ok: boolean }
  }
  'window:toggle-maximize': {
    request: void
    response: { ok: boolean }
  }
  'window:close': {
    request: void
    response: { ok: boolean }
  }
  'window:is-maximized': {
    request: void
    response: { maximized: boolean }
  }
}

export type IpcInvokeChannel = keyof IpcInvokeContract

export type IpcRequest<TChannel extends IpcInvokeChannel> = IpcInvokeContract[TChannel]['request']

export type IpcResponse<TChannel extends IpcInvokeChannel> = IpcInvokeContract[TChannel]['response']
