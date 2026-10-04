import type { BrowserWindow } from 'electron'
import { ipcChannels } from '@shared/ipc/channels'
import type { IpcEventPayload } from '@shared/ipc/contracts'
import { sendRendererEvent } from '@main/ipc/rendererEvents'

export function getWindowVisibility(
  window: BrowserWindow,
): IpcEventPayload<'window:visibility-changed'> {
  return { isVisible: !window.isDestroyed() && window.isVisible() && !window.isMinimized() }
}

export function observeWindowVisibility(window: BrowserWindow): () => void {
  const notify = () => {
    sendRendererEvent(
      window.webContents,
      ipcChannels.window.visibilityChanged,
      getWindowVisibility(window),
    )
  }
  window.on('show', notify)
  window.on('hide', notify)
  window.on('minimize', notify)
  window.on('restore', notify)
  return () => {
    window.removeListener('show', notify)
    window.removeListener('hide', notify)
    window.removeListener('minimize', notify)
    window.removeListener('restore', notify)
  }
}
