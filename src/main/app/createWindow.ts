import { BrowserWindow, app, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ipcChannels } from '@shared/ipc/channels'
import type { SplashScreenReadyPayload, SplashScreenTheme } from '@shared/ipc/contracts'
import { registerMainWindow } from './mainWindowRegistry'
import { createWindowsThumbarController } from './windowsThumbarController'
import { secureRendererWindow } from './webContentsSecurity'
import { sendRendererEvent } from '@main/ipc/rendererEvents'

function resolveAppIconPath(): string | undefined {
  const candidates = [
    join(process.resourcesPath, 'icons', 'icon.png'),
    join(app.getAppPath(), 'resources', 'icons', 'icon.png'),
    join(__dirname, '../../resources/icons/icon.png'),
  ]

  return candidates.find((candidate) => existsSync(candidate))
}

export function createWindow(options: { showSplash?: boolean } = {}): BrowserWindow {
  const showSplash = options.showSplash !== false
  const icon = resolveAppIconPath()

  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 620,
    title: 'Auralis',
    // 默认深色主题底色，与 main.css 的 --auralis-bg 一致；
    // 实际主题在收到 app:splash-ready 后、窗口可见前再对齐。
    backgroundColor: '#121212',
    transparent: false,
    frame: false,
    show: false,
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

  registerMainWindow(window)
  const disposeThumbarController = createWindowsThumbarController(window)

  const notifyMaximizedChanged = (): void => {
    if (!window.webContents.isDestroyed()) {
      sendRendererEvent(window.webContents, ipcChannels.window.maximizedChanged, {
        isMaximized: window.isMaximized(),
      })
    }
  }
  window.on('maximize', notifyMaximizedChanged)
  window.on('unmaximize', notifyMaximizedChanged)

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

  // 开屏首帧色值，与 public/splash/splash.css 及 main.css 主题 token 一致。
  const SPLASH_THEME_BACKGROUNDS: Record<SplashScreenTheme, string> = {
    dark: '#121212',
    light: '#f0f1f2',
  }

  // 开屏可绘制信号：仅接受主窗口顶层 frame 的通知；payload 经枚举校验后
  // 先对齐原生底色再显示窗口，避免浅色主题从深色原生底色闪入。
  const handleSplashReady = (event: Electron.IpcMainEvent, payload: unknown): void => {
    if (event.sender !== window.webContents) return
    if (!event.senderFrame || event.senderFrame !== window.webContents.mainFrame) return

    const theme = (payload as SplashScreenReadyPayload | undefined)?.theme
    if (theme !== 'light' && theme !== 'dark') return

    window.setBackgroundColor(SPLASH_THEME_BACKGROUNDS[theme])
    if (showSplash) showWindow()
  }

  ipcMain.on(ipcChannels.app.rendererReady, handleRendererReady)
  ipcMain.on(ipcChannels.app.splashReady, handleSplashReady)

  window.once('closed', () => {
    clearTimeout(readyTimeout)
    ipcMain.removeListener(ipcChannels.app.rendererReady, handleRendererReady)
    ipcMain.removeListener(ipcChannels.app.splashReady, handleSplashReady)
    disposeThumbarController()
  })

  window.webContents.once('render-process-gone', showWindow)
  window.webContents.once('did-fail-load', showWindow)

  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(rendererEntry)
    if (!showSplash) url.searchParams.set('splash', '0')
    window.loadURL(url.toString())
  } else {
    if (showSplash) window.loadFile(rendererEntry)
    else window.loadFile(rendererEntry, { query: { splash: '0' } })
  }

  return window
}
