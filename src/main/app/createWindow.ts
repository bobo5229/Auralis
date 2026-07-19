import { BrowserWindow, app, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ipcChannels } from '@shared/ipc/channels'
import { MiniPlayerWindowController } from './miniPlayerWindowController'
import { createWindowsThumbarController } from './windowsThumbarController'

function resolveAppIconPath(): string | undefined {
  const candidates = [
    join(process.resourcesPath, 'icons', 'icon.png'),
    join(app.getAppPath(), 'resources', 'icons', 'icon.png'),
    join(__dirname, '../../resources/icons/icon.png'),
  ]

  return candidates.find((candidate) => existsSync(candidate))
}

export function createWindow(): BrowserWindow {
  const icon = resolveAppIconPath()

  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    title: 'Auralis',
    backgroundColor: '#00000000',
    transparent: true,
    show: false,
    titleBarStyle: 'hidden',
    frame: false,
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
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
  new MiniPlayerWindowController(window)
  const disposeThumbarController = createWindowsThumbarController(window)

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
    disposeThumbarController()
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
