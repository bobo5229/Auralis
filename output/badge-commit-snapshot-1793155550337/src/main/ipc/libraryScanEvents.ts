import { ipcChannels } from '@shared/ipc/channels'
import type { LibraryScanEvents } from '@main/features/libraryScan/libraryScanEvents'
import type { RendererEventSender } from './rendererEvents'

export function createLibraryScanEvents(send: RendererEventSender): LibraryScanEvents {
  return {
    progress: (progress) => send(ipcChannels.library.scanProgress, progress),
    changed: (event) => send(ipcChannels.library.changed, event),
  }
}
