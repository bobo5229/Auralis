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
  },
  library: {
    getStats: () => invoke(ipcChannels.library.getStats),
    selectRoot: () => invoke(ipcChannels.library.selectRoot),
    getRoots: () => invoke(ipcChannels.library.getRoots),
    startScan: (rootId) => invoke(ipcChannels.library.startScan, { rootId }),
    cancelScan: (jobId) => invoke(ipcChannels.library.cancelScan, { jobId }),
    getScanStatus: (jobId) =>
      invoke(ipcChannels.library.getScanStatus, jobId ? { jobId } : undefined),
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
}

contextBridge.exposeInMainWorld('auralis', auralisApi)
