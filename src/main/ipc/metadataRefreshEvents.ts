import type { MetadataRefreshEvents } from '@main/features/metadata/metadataRefreshEvents'
import { ipcChannels } from '@shared/ipc/channels'
import type { RendererEventSender } from './rendererEvents'

export function createMetadataRefreshEvents(send: RendererEventSender): MetadataRefreshEvents {
  return {
    libraryChanged: (event) => send(ipcChannels.library.changed, event),
    refreshProgress: (progress) => send(ipcChannels.metadata.refreshProgress, progress),
  }
}
