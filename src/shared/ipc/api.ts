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
  ListeningHeatmap,
  ListeningRanking,
  ListeningRankingParams,
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
          | 'play-stats-updated'
          | 'play-stats-reset'
        trackIds: number[]
        filePaths: string[]
      }) => void,
    ) => () => void
  }
  smartPlaylists: {
    list: () => Promise<SmartPlaylist[]>
    listTrackCounts: () => Promise<SmartPlaylistTrackCount[]>
    getDetail: (id: number) => Promise<SmartPlaylistDetail | null>
    create: (name: string, rule: SmartPlaylistRule) => Promise<CreateSmartPlaylistResult>
    createFromQuery: (query: string) => Promise<CreateSmartPlaylistResult>
    rename: (id: number, name: string) => Promise<SmartPlaylist | null>
    updateViewMode: (id: number, viewMode: SmartPlaylistViewMode) => Promise<SmartPlaylist | null>
    delete: (id: number) => Promise<{ deleted: boolean }>
    reorder: (ids: number[]) => Promise<SmartPlaylist[]>
  }
  playlists: {
    list: () => Promise<Playlist[]>
    listTrackCounts: () => Promise<PlaylistTrackCount[]>
    listSidebarItems: () => Promise<SidebarPlaylistItem[]>
    getDetail: (id: number) => Promise<PlaylistDetail | null>
    create: () => Promise<Playlist>
    rename: (id: number, name: string) => Promise<Playlist | null>
    updateViewMode: (id: number, viewMode: PlaylistViewMode) => Promise<Playlist | null>
    delete: (id: number) => Promise<{ deleted: boolean }>
    addTracks: (id: number, trackIds: number[]) => Promise<AddPlaylistTracksResult>
    reorderSidebarItems: (
      items: Array<{ kind: SidebarPlaylistKind; id: number }>,
    ) => Promise<SidebarPlaylistItem[]>
  }
  lyrics: {
    getByTrackId: (trackId: number) => Promise<TrackLyrics | null>
  }
  playback: {
    getAudioUrl: (trackId: number) => Promise<{ url: string } | null>
    getRandomTrack: (excludeTrackId?: number) => Promise<PlaybackTrackDto | null>
    getRandomAlbumTracks: (excludeAlbumKey?: {
      albumArtist: string
      album: string
    }) => Promise<RandomAlbumTracksResult | null>
    getAlbumTracks: (albumKey: {
      albumArtist: string
      album: string
    }) => Promise<RandomAlbumTracksResult | null>
    recordEffectivePlay: (payload: {
      trackId: number
      sessionId: string
      playedAtIso: string
    }) => Promise<{ ok: boolean; recorded: boolean }>
  }
  desktopLyrics: {
    toggle: () => Promise<{ visible: boolean }>
    isVisible: () => Promise<{ visible: boolean }>
    toggleMousePassthrough: () => Promise<{ enabled: boolean }>
    isMousePassthroughEnabled: () => Promise<{ enabled: boolean }>
    update: (payload: DesktopLyricsPayload) => Promise<{ ok: boolean }>
    onUpdate: (callback: (payload: DesktopLyricsPayload) => void) => () => void
    onVisibilityChanged: (callback: (visible: boolean) => void) => () => void
    onMousePassthroughChanged: (callback: (enabled: boolean) => void) => () => void
  }
  archive: {
    getListeningHeatmap: (year: number) => Promise<ListeningHeatmap>
    getDailyListeningDetail: (date: string) => Promise<DailyListeningDetail>
    getAnnualListeningInsights: (year: number) => Promise<AnnualListeningInsights>
    getListeningRanking: (params: ListeningRankingParams) => Promise<ListeningRanking>
    resetPlayStats: () => Promise<{ ok: true }>
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
    clearRefreshFailures: () => Promise<{ deletedCount: number }>
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
  window: {
    minimize: () => Promise<{ ok: boolean }>
    toggleMaximize: () => Promise<{ ok: boolean }>
    close: () => Promise<{ ok: boolean }>
    isMaximized: () => Promise<{ maximized: boolean }>
  }
}

/** Minimal API exposed only to the desktop lyrics renderer. */
export interface DesktopLyricsApi {
  desktopLyrics: Pick<AuralisApi['desktopLyrics'], 'onUpdate'>
}

export type RendererApi = AuralisApi | DesktopLyricsApi
