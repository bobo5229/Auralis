import { ipcChannels } from '@shared/ipc/channels'
import type { IpcHandlerRegistrar } from './validatedIpcRegistrar'
import type { AlbumMetadataEditService } from '@main/features/metadata/albumMetadataEditService'

export function registerAlbumMetadataEditIpcHandlers(
  registrar: IpcHandlerRegistrar,
  service: AlbumMetadataEditService,
): void {
  registrar.handle(ipcChannels.metadata.prepareAlbumEdit, (_event, payload) =>
    service.prepare(payload),
  )
  registrar.handle(ipcChannels.metadata.previewAlbumEdit, (_event, payload) =>
    service.preview(payload.taskId, payload.operations, payload.skipBlocked),
  )
  registrar.handle(ipcChannels.metadata.startAlbumEdit, (_event, payload) =>
    service.start(payload.taskId),
  )
  registrar.handle(ipcChannels.metadata.getAlbumEdit, () => service.get())
  registrar.handle(ipcChannels.metadata.cancelAlbumEdit, (_event, payload) =>
    service.cancel(payload.taskId),
  )
  registrar.handle(ipcChannels.metadata.releaseAlbumEdit, (_event, payload) =>
    service.release(payload.taskId),
  )
}
