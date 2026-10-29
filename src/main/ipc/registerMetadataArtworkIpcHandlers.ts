import { dialog } from 'electron'
import { ipcChannels } from '@shared/ipc/channels'
import type { IpcHandlerRegistrar } from './validatedIpcRegistrar'
import type { MetadataRefreshService } from '@main/features/metadata/metadataRefreshService'

export function registerMetadataArtworkIpcHandlers(
  registrar: IpcHandlerRegistrar,
  service: MetadataRefreshService,
): void {
  registrar.handle(ipcChannels.metadata.getMetadataArtwork, (_event, payload) =>
    service.getMetadataArtwork(payload.trackId, payload.editToken),
  )
  registrar.handle(ipcChannels.metadata.importMetadataArtwork, (_event, payload) =>
    service.importMetadataArtwork(payload.trackId, payload.editToken, async () => {
      const selected = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'JPEG / PNG', extensions: ['jpg', 'jpeg', 'png'] }],
      })
      return selected.canceled ? null : (selected.filePaths[0] ?? null)
    }),
  )
  registrar.handle(ipcChannels.metadata.releaseMetadataEdit, (_event, payload) =>
    service.releaseMetadataEdit(payload.editToken),
  )
}
