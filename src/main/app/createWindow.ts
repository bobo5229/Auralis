import { BrowserWindow, app, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ipcChannels } from '@shared/ipc/channels'
import { disposeDesktopLyricsWindow } from './desktopLyricsWindow'
import { MiniPlayerWindowController } from './miniPlayerWindowController'
import { createWindowsThumbarController } from './windowsThumbarController'
import { secureRendererWindow } from './webContentsSecurity'

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
    backgroundColor: '#1f2528',
    transparent: false,
    frame: true,
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#e1ddd6',
      height: 36,
    },
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      webSecurity: true,
    },
  })

  const rendererEntry = process.env.ELECTRON_RENDERER_URL
    ? process.env.ELECTRON_RENDERER_URL
    : join(__dirname, '../renderer/index.html')
  secureRendererWindow(window, rendererEntry)

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
    disposeDesktopLyricsWindow()
  })

  window.webContents.once('render-process-gone', showWindow)
  window.webContents.once('did-fail-load', showWindow)

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(rendererEntry)
  } else {
    window.loadFile(rendererEntry)
  }

  return window
}
