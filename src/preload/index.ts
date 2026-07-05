import { contextBridge, ipcRenderer } from 'electron'
import type { AuralisApi } from '@shared/ipc/api'
import type { IpcInvokeChannel, IpcRequest, IpcResponse } from '@shared/ipc/contracts'
import { ipcChannels } from '@shared/ipc/channels'
import type { LibraryScanProgress } from '@shared/types/libraryScan'

async function invoke<TChannel extends IpcInvokeChannel>(
  channel: TChannel,
  payload?: IpcRequest<TChannel>,
): Promise<IpcResponse<TChannel>> {
  return ipcRenderer.invoke(channel, payload)
}

export const auralisApi: AuralisApi = {
  app: {
    getInfo: () => invoke(ipcChannels.app.getInfo),
    rendererReady: () => ipcRenderer.send(ipcChannels.app.rendererReady),
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
    onScanProgress: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: LibraryScanProgress) => {
        callback(progress)
      }

      ipcRenderer.on(ipcChannels.library.scanProgress, listener)

      return () => {
        ipcRenderer.removeListener(ipcChannels.library.scanProgress, listener)
      }
    },
    onChanged: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        event: {
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
        },
      ) => {
        callback(event)
      }

      ipcRenderer.on(ipcChannels.library.changed, listener)

      return () => {
        ipcRenderer.removeListener(ipcChannels.library.changed, listener)
      }
    },
  },
  lyrics: {
    getByTrackId: (trackId) => invoke(ipcChannels.lyrics.getByTrackId, { trackId }),
  },
  playback: {
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
  archive: {
    getListeningHeatmap: (year) => invoke(ipcChannels.archive.getListeningHeatmap, { year }),
    getDailyListeningDetail: (date) =>
      invoke(ipcChannels.archive.getDailyListeningDetail, { date }),
    getAnnualListeningInsights: (year) =>
      invoke(ipcChannels.archive.getAnnualListeningInsights, { year }),
    getListeningRanking: (params) => invoke(ipcChannels.archive.getListeningRanking, params),
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
    onRefreshProgress: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        progress: {
          jobId: number
          status: string
          totalTracks: number
          processedTracks: number
          failedTracks: number
        },
      ) => {
        callback(progress)
      }

      ipcRenderer.on(ipcChannels.metadata.refreshProgress, listener)

      return () => {
        ipcRenderer.removeListener(ipcChannels.metadata.refreshProgress, listener)
      }
    },
  },
  window: {
    minimize: () => invoke(ipcChannels.window.minimize),
    toggleMaximize: () => invoke(ipcChannels.window.toggleMaximize),
    close: () => invoke(ipcChannels.window.close),
    isMaximized: () => invoke(ipcChannels.window.isMaximized),
  },
}

contextBridge.exposeInMainWorld('auralis', auralisApi)
