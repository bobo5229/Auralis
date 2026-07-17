import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { ipcChannels } from '@shared/ipc/channels'

export function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    title: 'Auralis',
    backgroundColor: '#f6f2ea',
    show: false,
    titleBarStyle: 'hidden',
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox stays false: preload uses ESM contextBridge bridge without sandbox-compatible bundling.
      sandbox: false,
      backgroundThrottling: false,
      webSecurity: true,
    },
  })

  window.setMenuBarVisibility(false)

  let didShow = false

  const showWindow = (): void => {
    if (didShow || window.isDestroyed()) {
      return
    }

    didShow = true
    window.show()
  }

  const READY_TIMEOUT_MS = 5_000
  const readyTimeout = setTimeout(() => {
    showWindow()
  }, READY_TIMEOUT_MS)

  const handleRendererReady = (event: Electron.IpcMainEvent): void => {
    if (event.sender === window.webContents) {
      clearTimeout(readyTimeout)
      showWindow()
    }
  }

  ipcMain.on(ipcChannels.app.rendererReady, handleRendererReady)

  window.once('closed', () => {
    clearTimeout(readyTimeout)
    ipcMain.removeListener(ipcChannels.app.rendererReady, handleRendererReady)
  })

  window.webContents.once('render-process-gone', showWindow)
  window.webContents.once('did-fail-load', showWindow)

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}
