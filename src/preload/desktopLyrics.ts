import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopLyricsApi } from '@shared/ipc/api'
import type { DesktopLyricsPayload } from '@shared/types/desktopLyrics'

// Keep this entry free of shared runtime imports so the preload bundle
// does not code-split into chunks Electron cannot load.
const DESKTOP_LYRICS_CHANGED = 'desktop-lyrics:changed'

/**
 * Minimal preload for the desktop lyrics window.
 * Intentionally does NOT expose the full AuralisApi surface.
 */
const desktopLyricsApi: DesktopLyricsApi = {
  desktopLyrics: {
    onUpdate: (callback: (payload: DesktopLyricsPayload) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: DesktopLyricsPayload): void => {
        callback(payload)
      }

      ipcRenderer.on(DESKTOP_LYRICS_CHANGED, listener)

      return () => {
        ipcRenderer.removeListener(DESKTOP_LYRICS_CHANGED, listener)
      }
    },
  },
}

contextBridge.exposeInMainWorld('auralis', desktopLyricsApi)
