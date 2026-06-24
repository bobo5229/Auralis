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
  },
  lyrics: {
    getByTrackId: (trackId) => invoke(ipcChannels.lyrics.getByTrackId, { trackId }),
  },
  metadata: {
    refreshTrack: (trackId) => invoke(ipcChannels.metadata.refreshTrack, { trackId }),
    refreshTracks: (trackIds) => invoke(ipcChannels.metadata.refreshTracks, { trackIds }),
    refreshMissing: (limit) => invoke(ipcChannels.metadata.refreshMissing, { limit }),
    refreshLyricsMissing: (limit) => invoke(ipcChannels.metadata.refreshLyricsMissing, { limit }),
    getRefreshStatus: (jobId) => invoke(ipcChannels.metadata.getRefreshStatus, { jobId }),
    listRefreshFailures: (limit) =>
      invoke(ipcChannels.metadata.listRefreshFailures, limit ? { limit } : undefined),
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
}

contextBridge.exposeInMainWorld('auralis', auralisApi)
