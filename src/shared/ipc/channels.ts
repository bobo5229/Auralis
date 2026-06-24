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
  },
  lyrics: {
    getByTrackId: 'lyrics:get-by-track-id',
  },
} as const
