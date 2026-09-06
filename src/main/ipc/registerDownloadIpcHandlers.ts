import { ipcChannels } from '@shared/ipc/channels'
import type { AmdlDownloadMode } from '@shared/types/amdl'
import type { AmdlDownloadService } from '@main/features/amdl/amdlDownloadService'
import type { IpcHandlerRegistrar } from './ipcHandlerRegistrar'

export interface DownloadIpcDependencies {
  downloadService: AmdlDownloadService
}

export function registerDownloadIpcHandlers(
  registrar: IpcHandlerRegistrar,
  dependencies: DownloadIpcDependencies,
): void {
  const { downloadService } = dependencies

  registrar.handle(
    ipcChannels.download.start,
    (_event, payload: { url: string; mode?: AmdlDownloadMode }) => {
      return downloadService.startDownload(payload.url, payload.mode ?? 'direct')
    },
  )

  registrar.handle(ipcChannels.download.cancel, (_event, payload: { taskId: string }) => {
    return downloadService.cancelDownload(payload.taskId)
  })

  registrar.handle(ipcChannels.download.getStatus, (_event, payload: { taskId: string }) => {
    const active = downloadService.getActiveProgress()
    if (active && active.taskId === payload.taskId) {
      return active
    }
    return null
  })

  registrar.handle(
    ipcChannels.download.submitSelection,
    (_event, payload: { taskId: string; trackIndexes: number[] }) => {
      return downloadService.submitSelection(payload.taskId, payload.trackIndexes)
    },
  )
}
