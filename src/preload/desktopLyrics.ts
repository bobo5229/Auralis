import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopLyricsApi } from '@shared/ipc/api'
import type {
  IpcEventChannel,
  IpcEventPayload,
  IpcInvokeChannel,
  IpcResponse,
  IpcSendChannel,
} from '@shared/ipc/contracts'

// Keep this entry free of shared runtime imports so the preload bundle
// does not code-split into chunks Electron cannot load.
const DESKTOP_LYRICS_CHANGED = 'desktop-lyrics:changed' satisfies IpcEventChannel
const DESKTOP_LYRICS_READY = 'desktop-lyrics:ready' satisfies IpcSendChannel
const DESKTOP_LYRICS_TOGGLE_MOUSE_PASSTHROUGH =
  'desktop-lyrics:toggle-mouse-passthrough' satisfies IpcInvokeChannel
const DESKTOP_LYRICS_MOUSE_PASSTHROUGH_CHANGED =
  'desktop-lyrics:mouse-passthrough-changed' satisfies IpcEventChannel

/**
 * Minimal preload for the desktop lyrics window.
 * Intentionally does NOT expose the full AuralisApi surface.
 */
const desktopLyricsApi: DesktopLyricsApi = {
  desktopLyrics: {
    onUpdate: (
      callback: (payload: IpcEventPayload<typeof DESKTOP_LYRICS_CHANGED>) => void,
    ): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload: IpcEventPayload<typeof DESKTOP_LYRICS_CHANGED>,
      ): void => {
        callback(payload)
      }

      ipcRenderer.on(DESKTOP_LYRICS_CHANGED, listener)

      return () => {
        ipcRenderer.removeListener(DESKTOP_LYRICS_CHANGED, listener)
      }
    },
    onMousePassthroughChanged: (
      callback: (enabled: IpcEventPayload<typeof DESKTOP_LYRICS_MOUSE_PASSTHROUGH_CHANGED>) => void,
    ): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        enabled: IpcEventPayload<typeof DESKTOP_LYRICS_MOUSE_PASSTHROUGH_CHANGED>,
      ): void => {
        callback(enabled)
      }

      ipcRenderer.on(DESKTOP_LYRICS_MOUSE_PASSTHROUGH_CHANGED, listener)

      return () => {
        ipcRenderer.removeListener(DESKTOP_LYRICS_MOUSE_PASSTHROUGH_CHANGED, listener)
      }
    },
    toggleMousePassthrough: (): Promise<
      IpcResponse<typeof DESKTOP_LYRICS_TOGGLE_MOUSE_PASSTHROUGH>
    > =>
      ipcRenderer.invoke(DESKTOP_LYRICS_TOGGLE_MOUSE_PASSTHROUGH) as Promise<
        IpcResponse<typeof DESKTOP_LYRICS_TOGGLE_MOUSE_PASSTHROUGH>
      >,
    ready: (): void => {
      ipcRenderer.send(DESKTOP_LYRICS_READY)
    },
  },
}

contextBridge.exposeInMainWorld('auralis', desktopLyricsApi)
