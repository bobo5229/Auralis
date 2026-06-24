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
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  let didShow = false

  const showWindow = (): void => {
    if (didShow || window.isDestroyed()) {
      return
    }

    didShow = true
    window.show()
  }

  const handleRendererReady = (event: Electron.IpcMainEvent): void => {
    if (event.sender === window.webContents) {
      showWindow()
    }
  }

  ipcMain.on(ipcChannels.app.rendererReady, handleRendererReady)

  window.once('closed', () => {
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
