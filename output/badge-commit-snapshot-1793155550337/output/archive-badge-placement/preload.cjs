var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/preload/index.ts
var index_exports = {};
__export(index_exports, {
  auralisApi: () => auralisApi
});
module.exports = __toCommonJS(index_exports);
var import_electron = require("electron");

// src/shared/ipc/channels.ts
var ipcChannels = {
  database: {
    exportBackup: "database:export-backup",
    restoreBackup: "database:restore-backup"
  },
  app: {
    getInfo: "app:get-info",
    setLocale: "app:set-locale",
    claimCdStartupEntry: "app:claim-cd-startup-entry",
    claimStartupAlbum: "app:claim-startup-album",
    drawStartupAlbum: "app:draw-startup-album",
    exportDiagnostics: "app:export-diagnostics",
    rendererReady: "app:renderer-ready",
    splashReady: "app:splash-ready"
  },
  library: {
    getStats: "library:get-stats",
    selectRoot: "library:select-root",
    getRoots: "library:get-roots",
    startScan: "library:start-scan",
    cancelScan: "library:cancel-scan",
    getScanStatus: "library:get-scan-status",
    getTracks: "library:get-tracks",
    getTrackPage: "library:get-track-page",
    getAlbumDetail: "library:get-album-detail",
    revealInExplorer: "library:reveal-in-explorer",
    scanProgress: "library:scan-progress",
    changed: "library:changed"
  },
  smartPlaylists: {
    list: "smart-playlists:list",
    listTrackCounts: "smart-playlists:list-track-counts",
    getDetail: "smart-playlists:get-detail",
    create: "smart-playlists:create",
    createFromQuery: "smart-playlists:create-from-query",
    createRecentAdded: "smart-playlists:create-recent-added",
    updateRecentAddedDays: "smart-playlists:update-recent-added-days",
    rename: "smart-playlists:rename",
    updateViewMode: "smart-playlists:update-view-mode",
    delete: "smart-playlists:delete",
    reorder: "smart-playlists:reorder"
  },
  playlists: {
    changed: "playlists:changed",
    list: "playlists:list",
    listTrackCounts: "playlists:list-track-counts",
    listSidebarItems: "playlists:list-sidebar-items",
    getDetail: "playlists:get-detail",
    create: "playlists:create",
    rename: "playlists:rename",
    updateViewMode: "playlists:update-view-mode",
    delete: "playlists:delete",
    addTracks: "playlists:add-tracks",
    reorderSidebarItems: "playlists:reorder-sidebar-items"
  },
  lyrics: {
    getByTrackId: "lyrics:get-by-track-id",
    openLrcEditor: "lyrics:open-lrc-editor",
    saveLrcEditor: "lyrics:save-lrc-editor",
    closeLrcEditor: "lyrics:close-lrc-editor"
  },
  playback: {
    spectrumSubscribe: "playback:spectrum-subscribe",
    spectrumFrame: "playback:spectrum-frame",
    nativeAvailability: "playback:native-availability",
    nativeCommand: "playback:native-command",
    nativeEvent: "playback:native-event",
    getAudioUrl: "playback:get-audio-url",
    getRandomTrack: "playback:get-random-track",
    getRandomAlbumTracks: "playback:get-random-album-tracks",
    getAlbumTracks: "playback:get-album-tracks",
    recordEffectivePlay: "playback:record-effective-play",
    acquireReadLease: "playback:acquire-read-lease",
    releaseReadLease: "playback:release-read-lease"
  },
  systemMedia: {
    updateThumbarState: "system-media:update-thumbar-state",
    command: "system-media:command"
  },
  archive: {
    getAnnualPlayCounts: "archive:get-annual-play-counts",
    getAnnualSummary: "archive:get-annual-summary",
    getDayTopTracks: "archive:get-day-top-tracks",
    getDayTopAlbums: "archive:get-day-top-albums",
    resetPlayStats: "archive:reset-play-stats"
  },
  metadata: {
    refreshTrack: "metadata:refresh-track",
    refreshTracks: "metadata:refresh-tracks",
    refreshLyricsMissing: "metadata:refresh-lyrics-missing",
    getRefreshStatus: "metadata:get-refresh-status",
    listRefreshFailures: "metadata:list-refresh-failures",
    clearRefreshFailures: "metadata:clear-refresh-failures",
    getTrackMetadata: "metadata:get-track-metadata",
    getTrackEditState: "metadata:get-track-edit-state",
    updateTrackMetadata: "metadata:update-track-metadata",
    refreshProgress: "metadata:refresh-progress",
    trackEditStateChanged: "metadata:track-edit-state-changed"
  },
  window: {
    getCloseBehavior: "window:get-close-behavior",
    setCloseBehavior: "window:set-close-behavior",
    control: "window:control",
    getMaximized: "window:get-maximized",
    maximizedChanged: "window:maximized-changed",
    getVisibility: "window:get-visibility",
    visibilityChanged: "window:visibility-changed"
  }
};

// src/preload/index.ts
async function invoke(channel, ...payload) {
  if (payload.length === 0) {
    return import_electron.ipcRenderer.invoke(channel);
  }
  return import_electron.ipcRenderer.invoke(channel, payload[0]);
}
function on(channel, callback) {
  const listener = (_event, payload) => {
    callback(payload);
  };
  import_electron.ipcRenderer.on(channel, listener);
  return () => {
    import_electron.ipcRenderer.removeListener(channel, listener);
  };
}
function send(channel, ...payload) {
  if (payload.length === 0) {
    import_electron.ipcRenderer.send(channel);
    return;
  }
  import_electron.ipcRenderer.send(channel, payload[0]);
}
var auralisApi = {
  database: {
    exportBackup: () => invoke(ipcChannels.database.exportBackup),
    restoreBackup: () => invoke(ipcChannels.database.restoreBackup)
  },
  app: {
    setLocale: (locale) => invoke(ipcChannels.app.setLocale, { locale }),
    getInfo: () => invoke(ipcChannels.app.getInfo),
    claimCdStartupEntry: () => invoke(ipcChannels.app.claimCdStartupEntry),
    claimStartupAlbum: (request) => invoke(ipcChannels.app.claimStartupAlbum, request),
    drawStartupAlbum: (request) => invoke(ipcChannels.app.drawStartupAlbum, request),
    exportDiagnostics: () => invoke(ipcChannels.app.exportDiagnostics),
    rendererReady: () => send(ipcChannels.app.rendererReady),
    splashReady: (payload) => send(ipcChannels.app.splashReady, payload)
  },
  library: {
    getStats: () => invoke(ipcChannels.library.getStats),
    selectRoot: () => invoke(ipcChannels.library.selectRoot),
    getRoots: () => invoke(ipcChannels.library.getRoots),
    startScan: (rootId) => invoke(ipcChannels.library.startScan, { rootId }),
    cancelScan: (jobId) => invoke(ipcChannels.library.cancelScan, { jobId }),
    getScanStatus: (jobId) => invoke(ipcChannels.library.getScanStatus, jobId ? { jobId } : void 0),
    getTracks: () => invoke(ipcChannels.library.getTracks),
    getTrackPage: (request) => invoke(ipcChannels.library.getTrackPage, request),
    getAlbumDetail: (request) => invoke(ipcChannels.library.getAlbumDetail, request),
    revealInExplorer: (request) => invoke(ipcChannels.library.revealInExplorer, request),
    onScanProgress: (callback) => on(ipcChannels.library.scanProgress, callback),
    onChanged: (callback) => on(ipcChannels.library.changed, callback)
  },
  smartPlaylists: {
    list: () => invoke(ipcChannels.smartPlaylists.list),
    listTrackCounts: () => invoke(ipcChannels.smartPlaylists.listTrackCounts),
    getDetail: (id) => invoke(ipcChannels.smartPlaylists.getDetail, { id }),
    create: (name, rule) => invoke(ipcChannels.smartPlaylists.create, { name, rule }),
    createFromQuery: (query) => invoke(ipcChannels.smartPlaylists.createFromQuery, { query }),
    createRecentAdded: (days) => invoke(ipcChannels.smartPlaylists.createRecentAdded, { days }),
    updateRecentAddedDays: (id, days) => invoke(ipcChannels.smartPlaylists.updateRecentAddedDays, { id, days }),
    rename: (id, name) => invoke(ipcChannels.smartPlaylists.rename, { id, name }),
    updateViewMode: (id, viewMode) => invoke(ipcChannels.smartPlaylists.updateViewMode, { id, viewMode }),
    delete: (id) => invoke(ipcChannels.smartPlaylists.delete, { id }),
    reorder: (ids) => invoke(ipcChannels.smartPlaylists.reorder, { ids })
  },
  playlists: {
    onChanged: (callback) => on(ipcChannels.playlists.changed, callback),
    list: () => invoke(ipcChannels.playlists.list),
    listTrackCounts: () => invoke(ipcChannels.playlists.listTrackCounts),
    listSidebarItems: () => invoke(ipcChannels.playlists.listSidebarItems),
    getDetail: (id) => invoke(ipcChannels.playlists.getDetail, { id }),
    create: () => invoke(ipcChannels.playlists.create),
    rename: (id, name) => invoke(ipcChannels.playlists.rename, { id, name }),
    updateViewMode: (id, viewMode) => invoke(ipcChannels.playlists.updateViewMode, { id, viewMode }),
    delete: (id) => invoke(ipcChannels.playlists.delete, { id }),
    addTracks: (id, trackIds) => invoke(ipcChannels.playlists.addTracks, { id, trackIds }),
    reorderSidebarItems: (items) => invoke(ipcChannels.playlists.reorderSidebarItems, { items })
  },
  lyrics: {
    getByTrackId: (trackId) => invoke(ipcChannels.lyrics.getByTrackId, { trackId }),
    openLrcEditor: (trackId) => invoke(ipcChannels.lyrics.openLrcEditor, { trackId }),
    saveLrcEditor: (request) => invoke(ipcChannels.lyrics.saveLrcEditor, request),
    closeLrcEditor: (sessionId) => invoke(ipcChannels.lyrics.closeLrcEditor, { sessionId })
  },
  playback: {
    subscribeSpectrum: (request) => invoke(ipcChannels.playback.spectrumSubscribe, request),
    onSpectrumFrame: (callback) => on(ipcChannels.playback.spectrumFrame, callback),
    nativeAvailability: () => invoke(ipcChannels.playback.nativeAvailability),
    nativeCommand: (request) => invoke(ipcChannels.playback.nativeCommand, request),
    onNativeEvent: (callback) => on(ipcChannels.playback.nativeEvent, callback),
    getAudioUrl: (trackId) => invoke(ipcChannels.playback.getAudioUrl, { trackId }),
    getRandomTrack: (excludeTrackId) => invoke(ipcChannels.playback.getRandomTrack, excludeTrackId ? { excludeTrackId } : void 0),
    getRandomAlbumTracks: (excludeAlbumKey) => invoke(
      ipcChannels.playback.getRandomAlbumTracks,
      excludeAlbumKey ? { excludeAlbumKey } : void 0
    ),
    getAlbumTracks: (albumKey) => invoke(ipcChannels.playback.getAlbumTracks, { albumKey }),
    recordEffectivePlay: (payload) => invoke(ipcChannels.playback.recordEffectivePlay, payload),
    acquireReadLease: (trackId) => invoke(ipcChannels.playback.acquireReadLease, { trackId }),
    releaseReadLease: (leaseId) => invoke(ipcChannels.playback.releaseReadLease, { leaseId })
  },
  systemMedia: {
    updateThumbarState: (state) => send(ipcChannels.systemMedia.updateThumbarState, state),
    onCommand: (callback) => on(ipcChannels.systemMedia.command, callback)
  },
  archive: {
    getAnnualPlayCounts: (year) => invoke(ipcChannels.archive.getAnnualPlayCounts, { year }),
    getAnnualSummary: (year) => invoke(ipcChannels.archive.getAnnualSummary, { year }),
    getDayTopTracks: (date) => invoke(ipcChannels.archive.getDayTopTracks, { date }),
    getDayTopAlbums: (date) => invoke(ipcChannels.archive.getDayTopAlbums, { date }),
    resetPlayStats: () => invoke(ipcChannels.archive.resetPlayStats)
  },
  metadata: {
    refreshTrack: (trackId) => invoke(ipcChannels.metadata.refreshTrack, { trackId }),
    refreshTracks: (trackIds) => invoke(ipcChannels.metadata.refreshTracks, { trackIds }),
    refreshLyricsMissing: (limit) => invoke(ipcChannels.metadata.refreshLyricsMissing, { limit }),
    getRefreshStatus: (jobId) => invoke(ipcChannels.metadata.getRefreshStatus, { jobId }),
    listRefreshFailures: (limit) => invoke(ipcChannels.metadata.listRefreshFailures, limit ? { limit } : void 0),
    clearRefreshFailures: () => invoke(ipcChannels.metadata.clearRefreshFailures),
    getTrackMetadata: (trackId) => invoke(ipcChannels.metadata.getTrackMetadata, { trackId }),
    getTrackEditState: (trackId) => invoke(ipcChannels.metadata.getTrackEditState, { trackId }),
    updateTrackMetadata: (metadata) => invoke(ipcChannels.metadata.updateTrackMetadata, metadata),
    onRefreshProgress: (callback) => on(ipcChannels.metadata.refreshProgress, callback),
    onTrackEditStateChanged: (callback) => on(ipcChannels.metadata.trackEditStateChanged, callback)
  },
  window: {
    getCloseBehavior: () => invoke(ipcChannels.window.getCloseBehavior),
    setCloseBehavior: (behavior) => invoke(ipcChannels.window.setCloseBehavior, { behavior }),
    control: (action) => invoke(ipcChannels.window.control, { action }),
    getMaximized: () => invoke(ipcChannels.window.getMaximized),
    getVisibility: () => invoke(ipcChannels.window.getVisibility),
    onVisibilityChanged: (callback) => on(ipcChannels.window.visibilityChanged, callback),
    onMaximizedChanged: (callback) => on(ipcChannels.window.maximizedChanged, callback)
  }
};
import_electron.contextBridge.exposeInMainWorld("auralis", auralisApi);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  auralisApi
});
