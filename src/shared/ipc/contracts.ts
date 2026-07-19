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
  AddPlaylistTracksResult,
  Playlist,
  PlaylistDetail,
  PlaylistTrackCount,
  PlaylistViewMode,
  SidebarPlaylistItem,
  SidebarPlaylistKind,
} from '@shared/types/playlist'
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
  SmartPlaylistTrackCount,
  SmartPlaylistViewMode,
} from '@shared/types/smartPlaylist'
import type { DesktopLyricsPayload } from '@shared/types/desktopLyrics'

export interface SystemMediaPlaybackState {
  hasTrack: boolean
  isPlaying: boolean
}

export type SystemMediaCommand = 'previous' | 'toggle-play-pause' | 'next'

export type MiniPlayerWindowMode = 'normal' | 'mini'
export type MiniPlayerPopoverDirection = 'above' | 'below'

/** Cover-first body metrics for the mini-player plaque (no popover). */
export interface MiniPlayerBodySize {
  coverSize: number
  width: number
  height: number
}

export interface MiniPlayerWindowState {
  mode: MiniPlayerWindowMode
  /** Active body size (cover-driven). Always present for layout sync. */
  body: MiniPlayerBodySize
  popover: {
    open: boolean
    direction: MiniPlayerPopoverDirection
    height: number
  }
  suggestedPopoverDirection: MiniPlayerPopoverDirection
}

export interface IpcSendContract {
  'system-media:update-thumbar-state': SystemMediaPlaybackState
}

export interface IpcEventContract {
  'system-media:command': SystemMediaCommand
  'window:mini-player-state-changed': MiniPlayerWindowState
}

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
  'smart-playlists:list-track-counts': {
    request: void
    response: SmartPlaylistTrackCount[]
  }
  'smart-playlists:get-detail': {
    request: { id: number }
    response: SmartPlaylistDetail | null
  }
  'smart-playlists:create': {
    request: { name: string; rule: SmartPlaylistRule }
    response: CreateSmartPlaylistResult
  }
  'smart-playlists:create-from-query': {
    request: { query: string }
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
  'playlists:list': {
    request: void
    response: Playlist[]
  }
  'playlists:list-track-counts': {
    request: void
    response: PlaylistTrackCount[]
  }
  'playlists:list-sidebar-items': {
    request: void
    response: SidebarPlaylistItem[]
  }
  'playlists:get-detail': {
    request: { id: number }
    response: PlaylistDetail | null
  }
  'playlists:create': {
    request: void
    response: Playlist
  }
  'playlists:rename': {
    request: { id: number; name: string }
    response: Playlist | null
  }
  'playlists:update-view-mode': {
    request: { id: number; viewMode: PlaylistViewMode }
    response: Playlist | null
  }
  'playlists:delete': {
    request: { id: number }
    response: { deleted: boolean }
  }
  'playlists:add-tracks': {
    request: { id: number; trackIds: number[] }
    response: AddPlaylistTracksResult
  }
  'playlists:reorder-sidebar-items': {
    request: { items: Array<{ kind: SidebarPlaylistKind; id: number }> }
    response: SidebarPlaylistItem[]
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
    response: { ok: boolean; recorded: boolean }
  }
  'desktop-lyrics:toggle': {
    request: void
    response: { visible: boolean }
  }
  'desktop-lyrics:is-visible': {
    request: void
    response: { visible: boolean }
  }
  'desktop-lyrics:toggle-mouse-passthrough': {
    request: void
    response: { enabled: boolean }
  }
  'desktop-lyrics:is-mouse-passthrough-enabled': {
    request: void
    response: { enabled: boolean }
  }
  'desktop-lyrics:update': {
    request: DesktopLyricsPayload
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
  'window:enter-mini-player': {
    request: void
    response: MiniPlayerWindowState
  }
  'window:restore-from-mini-player': {
    request: void
    response: MiniPlayerWindowState
  }
  'window:get-mini-player-state': {
    request: void
    response: MiniPlayerWindowState
  }
  'window:set-mini-player-popover': {
    request: { open: boolean; direction: MiniPlayerPopoverDirection; height: number }
    response: MiniPlayerWindowState
  }
}

export type IpcInvokeChannel = keyof IpcInvokeContract

export type IpcRequest<TChannel extends IpcInvokeChannel> = IpcInvokeContract[TChannel]['request']

export type IpcResponse<TChannel extends IpcInvokeChannel> = IpcInvokeContract[TChannel]['response']
