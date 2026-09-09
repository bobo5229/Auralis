import type {
  IpcEventPayload,
  IpcInvokeChannel,
  IpcRequest,
  IpcResponse,
  IpcSendPayload,
} from './contracts'

type Req<C extends IpcInvokeChannel> = Exclude<IpcRequest<C>, void>
type Result<C extends IpcInvokeChannel> = Promise<IpcResponse<C>>

export interface AuralisApi {
  database: {
    exportBackup: () => Result<'database:export-backup'>
    restoreBackup: () => Result<'database:restore-backup'>
  }
  app: {
    getInfo: () => Result<'app:get-info'>
    exportDiagnostics: () => Result<'app:export-diagnostics'>
    rendererReady: () => void
  }
  library: {
    getStats: () => Result<'library:get-stats'>
    selectRoot: () => Result<'library:select-root'>
    getRoots: () => Result<'library:get-roots'>
    startScan: (rootId: Req<'library:start-scan'>['rootId']) => Result<'library:start-scan'>
    cancelScan: (jobId: Req<'library:cancel-scan'>['jobId']) => Result<'library:cancel-scan'>
    getScanStatus: (
      jobId?: Req<'library:get-scan-status'>['jobId'],
    ) => Result<'library:get-scan-status'>
    getTracks: () => Result<'library:get-tracks'>
    getTrackPage: (request: Req<'library:get-track-page'>) => Result<'library:get-track-page'>
    onScanProgress: (
      callback: (progress: IpcEventPayload<'library:scan-progress'>) => void,
    ) => () => void
    onChanged: (callback: (event: IpcEventPayload<'library:changed'>) => void) => () => void
  }
  smartPlaylists: {
    list: () => Result<'smart-playlists:list'>
    listTrackCounts: () => Result<'smart-playlists:list-track-counts'>
    getDetail: (id: Req<'smart-playlists:get-detail'>['id']) => Result<'smart-playlists:get-detail'>
    create: (
      name: Req<'smart-playlists:create'>['name'],
      rule: Req<'smart-playlists:create'>['rule'],
    ) => Result<'smart-playlists:create'>
    createFromQuery: (
      query: Req<'smart-playlists:create-from-query'>['query'],
    ) => Result<'smart-playlists:create-from-query'>
    rename: (
      id: Req<'smart-playlists:rename'>['id'],
      name: Req<'smart-playlists:rename'>['name'],
    ) => Result<'smart-playlists:rename'>
    updateViewMode: (
      id: Req<'smart-playlists:update-view-mode'>['id'],
      viewMode: Req<'smart-playlists:update-view-mode'>['viewMode'],
    ) => Result<'smart-playlists:update-view-mode'>
    delete: (id: Req<'smart-playlists:delete'>['id']) => Result<'smart-playlists:delete'>
    reorder: (ids: Req<'smart-playlists:reorder'>['ids']) => Result<'smart-playlists:reorder'>
  }
  playlists: {
    list: () => Result<'playlists:list'>
    listTrackCounts: () => Result<'playlists:list-track-counts'>
    listSidebarItems: () => Result<'playlists:list-sidebar-items'>
    getDetail: (id: Req<'playlists:get-detail'>['id']) => Result<'playlists:get-detail'>
    create: () => Result<'playlists:create'>
    rename: (
      id: Req<'playlists:rename'>['id'],
      name: Req<'playlists:rename'>['name'],
    ) => Result<'playlists:rename'>
    updateViewMode: (
      id: Req<'playlists:update-view-mode'>['id'],
      viewMode: Req<'playlists:update-view-mode'>['viewMode'],
    ) => Result<'playlists:update-view-mode'>
    delete: (id: Req<'playlists:delete'>['id']) => Result<'playlists:delete'>
    addTracks: (
      id: Req<'playlists:add-tracks'>['id'],
      trackIds: Req<'playlists:add-tracks'>['trackIds'],
    ) => Result<'playlists:add-tracks'>
    reorderSidebarItems: (
      items: Req<'playlists:reorder-sidebar-items'>['items'],
    ) => Result<'playlists:reorder-sidebar-items'>
  }
  lyrics: {
    getByTrackId: (
      trackId: Req<'lyrics:get-by-track-id'>['trackId'],
    ) => Result<'lyrics:get-by-track-id'>
  }
  playback: {
    getAudioUrl: (
      trackId: Req<'playback:get-audio-url'>['trackId'],
    ) => Result<'playback:get-audio-url'>
    getRandomTrack: (
      excludeTrackId?: Req<'playback:get-random-track'>['excludeTrackId'],
    ) => Result<'playback:get-random-track'>
    getRandomAlbumTracks: (
      excludeAlbumKey?: Req<'playback:get-random-album-tracks'>['excludeAlbumKey'],
    ) => Result<'playback:get-random-album-tracks'>
    getAlbumTracks: (
      albumKey: Req<'playback:get-album-tracks'>['albumKey'],
    ) => Result<'playback:get-album-tracks'>
    recordEffectivePlay: (
      payload: Req<'playback:record-effective-play'>,
    ) => Result<'playback:record-effective-play'>
  }
  systemMedia: {
    updateThumbarState: (state: IpcSendPayload<'system-media:update-thumbar-state'>) => void
    onCommand: (callback: (command: IpcEventPayload<'system-media:command'>) => void) => () => void
  }
  desktopLyrics: {
    toggle: () => Result<'desktop-lyrics:toggle'>
    isVisible: () => Result<'desktop-lyrics:is-visible'>
    setSuppressed: (
      suppressed: Req<'desktop-lyrics:set-suppressed'>['suppressed'],
    ) => Result<'desktop-lyrics:set-suppressed'>
    toggleMousePassthrough: () => Result<'desktop-lyrics:toggle-mouse-passthrough'>
    isMousePassthroughEnabled: () => Result<'desktop-lyrics:is-mouse-passthrough-enabled'>
    update: (payload: Req<'desktop-lyrics:update'>) => Result<'desktop-lyrics:update'>
    onUpdate: (callback: (payload: IpcEventPayload<'desktop-lyrics:changed'>) => void) => () => void
    onVisibilityChanged: (
      callback: (visible: IpcEventPayload<'desktop-lyrics:visibility-changed'>) => void,
    ) => () => void
    onMousePassthroughChanged: (
      callback: (enabled: IpcEventPayload<'desktop-lyrics:mouse-passthrough-changed'>) => void,
    ) => () => void
    ready: () => void
  }
  archive: {
    getListeningHeatmap: (
      year: Req<'archive:get-listening-heatmap'>['year'],
    ) => Result<'archive:get-listening-heatmap'>
    getDailyListeningDetail: (
      date: Req<'archive:get-daily-listening-detail'>['date'],
    ) => Result<'archive:get-daily-listening-detail'>
    getAnnualListeningInsights: (
      year: Req<'archive:get-annual-listening-insights'>['year'],
    ) => Result<'archive:get-annual-listening-insights'>
    getListeningRanking: (
      params: Req<'archive:get-listening-ranking'>,
    ) => Result<'archive:get-listening-ranking'>
    getListeningGenreSpectrum: (
      year: Req<'archive:get-listening-genre-spectrum'>['year'],
    ) => Result<'archive:get-listening-genre-spectrum'>
    resetPlayStats: () => Result<'archive:reset-play-stats'>
  }
  metadata: {
    refreshTrack: (
      trackId: Req<'metadata:refresh-track'>['trackId'],
    ) => Result<'metadata:refresh-track'>
    refreshTracks: (
      trackIds: Req<'metadata:refresh-tracks'>['trackIds'],
    ) => Result<'metadata:refresh-tracks'>
    refreshMissing: (
      limit?: Req<'metadata:refresh-missing'>['limit'],
    ) => Result<'metadata:refresh-missing'>
    refreshLyricsMissing: (
      limit?: Req<'metadata:refresh-lyrics-missing'>['limit'],
    ) => Result<'metadata:refresh-lyrics-missing'>
    getRefreshStatus: (
      jobId: Req<'metadata:get-refresh-status'>['jobId'],
    ) => Result<'metadata:get-refresh-status'>
    listRefreshFailures: (
      limit?: Req<'metadata:list-refresh-failures'>['limit'],
    ) => Result<'metadata:list-refresh-failures'>
    clearRefreshFailures: () => Result<'metadata:clear-refresh-failures'>
    getTrackMetadata: (
      trackId: Req<'metadata:get-track-metadata'>['trackId'],
    ) => Result<'metadata:get-track-metadata'>
    updateTrackMetadata: (
      metadata: Req<'metadata:update-track-metadata'>,
    ) => Result<'metadata:update-track-metadata'>
    onRefreshProgress: (
      callback: (progress: IpcEventPayload<'metadata:refresh-progress'>) => void,
    ) => () => void
  }
  window: {
    enterMiniPlayer: () => Result<'window:enter-mini-player'>
    restoreFromMiniPlayer: () => Result<'window:restore-from-mini-player'>
    getMiniPlayerState: () => Result<'window:get-mini-player-state'>
    setMiniPlayerPopover: (
      payload: Req<'window:set-mini-player-popover'>,
    ) => Result<'window:set-mini-player-popover'>
    onMiniPlayerStateChanged: (
      callback: (state: IpcEventPayload<'window:mini-player-state-changed'>) => void,
    ) => () => void
  }
  download: {
    start: (
      url: Req<'download:start'>['url'],
      mode?: Req<'download:start'>['mode'],
    ) => Result<'download:start'>
    cancel: (taskId: Req<'download:cancel'>['taskId']) => Result<'download:cancel'>
    getStatus: (taskId: Req<'download:get-status'>['taskId']) => Result<'download:get-status'>
    submitSelection: (
      taskId: Req<'download:submit-selection'>['taskId'],
      trackIndexes: Req<'download:submit-selection'>['trackIndexes'],
    ) => Result<'download:submit-selection'>
    onProgress: (callback: (progress: IpcEventPayload<'download:progress'>) => void) => () => void
    onLog: (callback: (log: IpcEventPayload<'download:log'>) => void) => () => void
    onSelectionRequest: (
      callback: (request: IpcEventPayload<'download:selection-request'>) => void,
    ) => () => void
  }
}

/** Minimal API exposed only to the desktop lyrics renderer. */
export interface DesktopLyricsApi {
  desktopLyrics: Pick<
    AuralisApi['desktopLyrics'],
    'onUpdate' | 'ready' | 'toggleMousePassthrough' | 'onMousePassthroughChanged'
  >
}

export type RendererApi = AuralisApi | DesktopLyricsApi
