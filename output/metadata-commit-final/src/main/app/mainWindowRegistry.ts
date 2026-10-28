import type { BrowserWindow } from 'electron'

const mainWindows = new WeakSet<BrowserWindow>()

/** Register before loading the renderer so its first IPC request is trusted. */
export function registerMainWindow(window: BrowserWindow): void {
  if (window.isDestroyed() || mainWindows.has(window)) return
  mainWindows.add(window)
  window.once('closed', () => mainWindows.delete(window))
}

export function isRegisteredMainWindow(window: BrowserWindow): boolean {
  return mainWindows.has(window) && !window.isDestroyed()
}
