export const ipcChannels = {
  app: {
    getInfo: 'app:get-info',
    rendererReady: 'app:renderer-ready',
  },
  library: {
    getStats: 'library:get-stats',
    selectRoot: 'library:select-root',
    getRoots: 'library:get-roots',
    startScan: 'library:start-scan',
    cancelScan: 'library:cancel-scan',
    getScanStatus: 'library:get-scan-status',
    getTracks: 'library:get-tracks',
    scanProgress: 'library:scan-progress',
    changed: 'library:changed',
  },
  lyrics: {
    getByTrackId: 'lyrics:get-by-track-id',
  },
  playback: {
    getAudioUrl: 'playback:get-audio-url',
    getRandomTrack: 'playback:get-random-track',
    getRandomAlbumTracks: 'playback:get-random-album-tracks',
    getAlbumTracks: 'playback:get-album-tracks',
    recordEffectivePlay: 'playback:record-effective-play',
  },
  metadata: {
    refreshTrack: 'metadata:refresh-track',
    refreshTracks: 'metadata:refresh-tracks',
    refreshMissing: 'metadata:refresh-missing',
    refreshLyricsMissing: 'metadata:refresh-lyrics-missing',
    getRefreshStatus: 'metadata:get-refresh-status',
    listRefreshFailures: 'metadata:list-refresh-failures',
    getTrackMetadata: 'metadata:get-track-metadata',
    updateTrackMetadata: 'metadata:update-track-metadata',
    refreshProgress: 'metadata:refresh-progress',
  },
  window: {
    minimize: 'window:minimize',
    toggleMaximize: 'window:toggle-maximize',
    close: 'window:close',
    isMaximized: 'window:is-maximized',
  },
} as const
