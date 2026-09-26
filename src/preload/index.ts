import { contextBridge, ipcRenderer } from 'electron'
import type { AuralisApi } from '@shared/ipc/api'
import type {
  IpcEventChannel,
  IpcEventPayload,
  IpcInvokeChannel,
  IpcRequest,
  IpcResponse,
  IpcSendChannel,
  IpcSendPayload,
} from '@shared/ipc/contracts'
import { ipcChannels } from '@shared/ipc/channels'

type IpcInvokeArgs<C extends IpcInvokeChannel> = [void] extends [IpcRequest<C>]
  ? [payload?: IpcRequest<C>]
  : [payload: IpcRequest<C>]

async function invoke<TChannel extends IpcInvokeChannel>(
  channel: TChannel,
  ...payload: IpcInvokeArgs<TChannel>
): Promise<IpcResponse<TChannel>> {
  if (payload.length === 0) {
    return ipcRenderer.invoke(channel)
  }

  return ipcRenderer.invoke(channel, payload[0])
}

function on<C extends IpcEventChannel>(
  channel: C,
  callback: (payload: IpcEventPayload<C>) => void,
): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: IpcEventPayload<C>) => {
    callback(payload)
  }

  ipcRenderer.on(channel, listener)

  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

function send<C extends IpcSendChannel>(
  channel: C,
  ...payload: IpcSendPayload<C> extends void ? [] : [IpcSendPayload<C>]
): void {
  if (payload.length === 0) {
    ipcRenderer.send(channel)
    return
  }

  ipcRenderer.send(channel, payload[0])
}

export const auralisApi: AuralisApi = {
  database: {
    exportBackup: () => invoke(ipcChannels.database.exportBackup),
    restoreBackup: () => invoke(ipcChannels.database.restoreBackup),
  },
  app: {
    getInfo: () => invoke(ipcChannels.app.getInfo),
    exportDiagnostics: () => invoke(ipcChannels.app.exportDiagnostics),
    rendererReady: () => send(ipcChannels.app.rendererReady),
  },
  library: {
    getStats: () => invoke(ipcChannels.library.getStats),
    selectRoot: () => invoke(ipcChannels.library.selectRoot),
    getRoots: () => invoke(ipcChannels.library.getRoots),
    startScan: (rootId) => invoke(ipcChannels.library.startScan, { rootId }),
    cancelScan: (jobId) => invoke(ipcChannels.library.cancelScan, { jobId }),
    getScanStatus: (jobId) =>
      invoke(ipcChannels.library.getScanStatus, jobId ? { jobId } : undefined),
    getTracks: () => invoke(ipcChannels.library.getTracks),
    getTrackPage: (request) => invoke(ipcChannels.library.getTrackPage, request),
    getAlbumDetail: (request) => invoke(ipcChannels.library.getAlbumDetail, request),
    onScanProgress: (callback) => on(ipcChannels.library.scanProgress, callback),
    onChanged: (callback) => on(ipcChannels.library.changed, callback),
  },
  smartPlaylists: {
    list: () => invoke(ipcChannels.smartPlaylists.list),
    listTrackCounts: () => invoke(ipcChannels.smartPlaylists.listTrackCounts),
    getDetail: (id) => invoke(ipcChannels.smartPlaylists.getDetail, { id }),
    create: (name, rule) => invoke(ipcChannels.smartPlaylists.create, { name, rule }),
    createFromQuery: (query) => invoke(ipcChannels.smartPlaylists.createFromQuery, { query }),
    rename: (id, name) => invoke(ipcChannels.smartPlaylists.rename, { id, name }),
    updateViewMode: (id, viewMode) =>
      invoke(ipcChannels.smartPlaylists.updateViewMode, { id, viewMode }),
    delete: (id) => invoke(ipcChannels.smartPlaylists.delete, { id }),
    reorder: (ids) => invoke(ipcChannels.smartPlaylists.reorder, { ids }),
  },
  playlists: {
    list: () => invoke(ipcChannels.playlists.list),
    listTrackCounts: () => invoke(ipcChannels.playlists.listTrackCounts),
    listSidebarItems: () => invoke(ipcChannels.playlists.listSidebarItems),
    getDetail: (id) => invoke(ipcChannels.playlists.getDetail, { id }),
    create: () => invoke(ipcChannels.playlists.create),
    rename: (id, name) => invoke(ipcChannels.playlists.rename, { id, name }),
    updateViewMode: (id, viewMode) =>
      invoke(ipcChannels.playlists.updateViewMode, { id, viewMode }),
    delete: (id) => invoke(ipcChannels.playlists.delete, { id }),
    addTracks: (id, trackIds) => invoke(ipcChannels.playlists.addTracks, { id, trackIds }),
    reorderSidebarItems: (items) => invoke(ipcChannels.playlists.reorderSidebarItems, { items }),
  },
  lyrics: {
    getByTrackId: (trackId) => invoke(ipcChannels.lyrics.getByTrackId, { trackId }),
  },
  playback: {
    nativeAvailability: () => invoke(ipcChannels.playback.nativeAvailability),
    nativeCommand: (request) => invoke(ipcChannels.playback.nativeCommand, request),
    onNativeEvent: (callback) => on(ipcChannels.playback.nativeEvent, callback),
    getAudioUrl: (trackId) => invoke(ipcChannels.playback.getAudioUrl, { trackId }),
    getRandomTrack: (excludeTrackId) =>
      invoke(ipcChannels.playback.getRandomTrack, excludeTrackId ? { excludeTrackId } : undefined),
    getRandomAlbumTracks: (excludeAlbumKey) =>
      invoke(
        ipcChannels.playback.getRandomAlbumTracks,
        excludeAlbumKey ? { excludeAlbumKey } : undefined,
      ),
    getAlbumTracks: (albumKey) => invoke(ipcChannels.playback.getAlbumTracks, { albumKey }),
    recordEffectivePlay: (payload) => invoke(ipcChannels.playback.recordEffectivePlay, payload),
  },
  systemMedia: {
    updateThumbarState: (state) => send(ipcChannels.systemMedia.updateThumbarState, state),
    onCommand: (callback) => on(ipcChannels.systemMedia.command, callback),
  },
  archive: {
    getListeningHeatmap: (year) => invoke(ipcChannels.archive.getListeningHeatmap, { year }),
    getDailyListeningDetail: (date) =>
      invoke(ipcChannels.archive.getDailyListeningDetail, { date }),
    getAnnualListeningInsights: (year) =>
      invoke(ipcChannels.archive.getAnnualListeningInsights, { year }),
    getListeningRanking: (params) => invoke(ipcChannels.archive.getListeningRanking, params),
    getListeningGenreSpectrum: (year) =>
      invoke(ipcChannels.archive.getListeningGenreSpectrum, { year }),
    resetPlayStats: () => invoke(ipcChannels.archive.resetPlayStats),
  },
  metadata: {
    refreshTrack: (trackId) => invoke(ipcChannels.metadata.refreshTrack, { trackId }),
    refreshTracks: (trackIds) => invoke(ipcChannels.metadata.refreshTracks, { trackIds }),
    refreshMissing: (limit) => invoke(ipcChannels.metadata.refreshMissing, { limit }),
    refreshLyricsMissing: (limit) => invoke(ipcChannels.metadata.refreshLyricsMissing, { limit }),
    getRefreshStatus: (jobId) => invoke(ipcChannels.metadata.getRefreshStatus, { jobId }),
    listRefreshFailures: (limit) =>
      invoke(ipcChannels.metadata.listRefreshFailures, limit ? { limit } : undefined),
    clearRefreshFailures: () => invoke(ipcChannels.metadata.clearRefreshFailures),
    getTrackMetadata: (trackId) => invoke(ipcChannels.metadata.getTrackMetadata, { trackId }),
    updateTrackMetadata: (metadata) => invoke(ipcChannels.metadata.updateTrackMetadata, metadata),
    onRefreshProgress: (callback) => on(ipcChannels.metadata.refreshProgress, callback),
  },
  window: {
    control: (action) => invoke(ipcChannels.window.control, { action }),
    getMaximized: () => invoke(ipcChannels.window.getMaximized),
    onMaximizedChanged: (callback) => on(ipcChannels.window.maximizedChanged, callback),
    enterMiniPlayer: () => invoke(ipcChannels.window.enterMiniPlayer),
    restoreFromMiniPlayer: () => invoke(ipcChannels.window.restoreFromMiniPlayer),
    getMiniPlayerState: () => invoke(ipcChannels.window.getMiniPlayerState),
    setMiniPlayerPopover: (payload) => invoke(ipcChannels.window.setMiniPlayerPopover, payload),
    onMiniPlayerStateChanged: (callback) => on(ipcChannels.window.miniPlayerStateChanged, callback),
  },
}

contextBridge.exposeInMainWorld('auralis', auralisApi)
