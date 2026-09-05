import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopLyricsApi } from '@shared/ipc/api'
import type { DesktopLyricsPayload } from '@shared/types/desktopLyrics'

// Keep this entry free of shared runtime imports so the preload bundle
// does not code-split into chunks Electron cannot load.
const DESKTOP_LYRICS_CHANGED = 'desktop-lyrics:changed'
const DESKTOP_LYRICS_READY = 'desktop-lyrics:ready'
const DESKTOP_LYRICS_TOGGLE_MOUSE_PASSTHROUGH = 'desktop-lyrics:toggle-mouse-passthrough'
const DESKTOP_LYRICS_MOUSE_PASSTHROUGH_CHANGED = 'desktop-lyrics:mouse-passthrough-changed'

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
    onMousePassthroughChanged: (callback: (enabled: boolean) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, enabled: boolean): void => {
        callback(enabled)
      }

      ipcRenderer.on(DESKTOP_LYRICS_MOUSE_PASSTHROUGH_CHANGED, listener)

      return () => {
        ipcRenderer.removeListener(DESKTOP_LYRICS_MOUSE_PASSTHROUGH_CHANGED, listener)
      }
    },
    toggleMousePassthrough: (): Promise<{ enabled: boolean }> =>
      ipcRenderer.invoke(DESKTOP_LYRICS_TOGGLE_MOUSE_PASSTHROUGH) as Promise<{ enabled: boolean }>,
    ready: (): void => {
      ipcRenderer.send(DESKTOP_LYRICS_READY)
    },
  },
}

contextBridge.exposeInMainWorld('auralis', desktopLyricsApi)
