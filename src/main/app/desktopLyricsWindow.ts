import { BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'node:path'
import { ipcChannels } from '@shared/ipc/channels'
import type { DesktopLyricsPayload } from '@shared/types/desktopLyrics'
import type { IpcResponse } from '@shared/ipc/contracts'
import { secureRendererWindow } from './webContentsSecurity'

let desktopLyricsWindow: BrowserWindow | null = null
let desktopLyricsEnabled = false
let desktopLyricsMousePassthroughEnabled = true
let latestPayload: DesktopLyricsPayload | null = null

function keepDesktopLyricsAbove(window: BrowserWindow): void {
  if (window.isDestroyed()) return

  window.setAlwaysOnTop(true, 'screen-saver')
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  applyDesktopLyricsMousePassthrough(window)
  window.moveTop()
}

function broadcastVisibility(visible: boolean): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(ipcChannels.desktopLyrics.visibilityChanged, visible)
  }
}

function broadcastMousePassthrough(enabled: boolean): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(ipcChannels.desktopLyrics.mousePassthroughChanged, enabled)
  }
}

function applyDesktopLyricsMousePassthrough(window = desktopLyricsWindow): void {
  if (!window || window.isDestroyed()) return

  // 始终保持不可聚焦（Alt+Tab 收录主要来自可聚焦窗口）；仅切换鼠标穿透
  window.setFocusable(false)
  window.setIgnoreMouseEvents(desktopLyricsMousePassthroughEnabled, { forward: true })
}

function sendLatestPayload(): void {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed() || !latestPayload) return
  desktopLyricsWindow.webContents.send(ipcChannels.desktopLyrics.changed, latestPayload)
}

function loadDesktopLyricsRenderer(window: BrowserWindow): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    url.searchParams.set('desktopLyrics', '1')
    window.loadURL(url.toString())
    return
  }

  window.loadFile(join(__dirname, '../renderer/index.html'), {
    query: { desktopLyrics: '1' },
  })
}

function syncDesktopLyricsWindowVisibility(): void {
  if (!desktopLyricsEnabled) {
    desktopLyricsWindow?.hide()
    return
  }

  const window = createDesktopLyricsWindow()

  window.showInactive()
  window.setSkipTaskbar(true) // show 后再设一次，防止被系统重置进任务栏 / Alt+Tab
  keepDesktopLyricsAbove(window)
  setTimeout(() => keepDesktopLyricsAbove(window), 80)
}

function createDesktopLyricsWindow(): BrowserWindow {
  if (desktopLyricsWindow && !desktopLyricsWindow.isDestroyed()) {
    return desktopLyricsWindow
  }

  const { workArea } = screen.getPrimaryDisplay()
  const width = Math.min(980, Math.max(720, workArea.width - 160))
  const height = 150

  desktopLyricsWindow = new BrowserWindow({
    width,
    height,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + workArea.height - height - 96),
    minWidth: 640,
    minHeight: 120,
    maxHeight: 220,
    title: 'Auralis',
    type: 'toolbar', // Windows: WS_EX_TOOLWINDOW 风格，不进入 Alt+Tab 切换列表
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    show: false,
    skipTaskbar: true,
    // 始终不可聚焦：tool window 不聚焦就不会被 Alt+Tab 收录
    focusable: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: {
      // Minimal preload: only desktop lyrics push subscription (no full AuralisApi).
      preload: join(__dirname, '../preload/desktopLyrics.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      webSecurity: true,
    },
  })

  secureRendererWindow(
    desktopLyricsWindow,
    process.env.ELECTRON_RENDERER_URL
      ? process.env.ELECTRON_RENDERER_URL
      : join(__dirname, '../renderer/index.html'),
  )

  keepDesktopLyricsAbove(desktopLyricsWindow)
  applyDesktopLyricsMousePassthrough(desktopLyricsWindow)
  desktopLyricsWindow.setMenuBarVisibility(false)

  desktopLyricsWindow.webContents.once('did-finish-load', sendLatestPayload)
  desktopLyricsWindow.on('system-context-menu', (event) => {
    event.preventDefault()
  })
  desktopLyricsWindow.webContents.on('context-menu', (event) => {
    event.preventDefault()
  })
  desktopLyricsWindow.on('show', () => {
    desktopLyricsWindow?.setSkipTaskbar(true)
    keepDesktopLyricsAbove(desktopLyricsWindow!)
    sendLatestPayload()
  })
  desktopLyricsWindow.on('closed', () => {
    desktopLyricsWindow = null
  })

  loadDesktopLyricsRenderer(desktopLyricsWindow)

  return desktopLyricsWindow
}

export function registerDesktopLyricsIpcHandlers(): void {
  ipcMain.handle(ipcChannels.desktopLyrics.toggle, (): IpcResponse<'desktop-lyrics:toggle'> => {
    desktopLyricsEnabled = !desktopLyricsEnabled
    syncDesktopLyricsWindowVisibility()
    broadcastVisibility(desktopLyricsEnabled)

    return { visible: desktopLyricsEnabled }
  })

  ipcMain.handle(
    ipcChannels.desktopLyrics.isVisible,
    (): IpcResponse<'desktop-lyrics:is-visible'> => ({
      visible: desktopLyricsEnabled,
    }),
  )

  ipcMain.handle(
    ipcChannels.desktopLyrics.toggleMousePassthrough,
    (): IpcResponse<'desktop-lyrics:toggle-mouse-passthrough'> => {
      desktopLyricsMousePassthroughEnabled = !desktopLyricsMousePassthroughEnabled
      applyDesktopLyricsMousePassthrough()
      broadcastMousePassthrough(desktopLyricsMousePassthroughEnabled)

      return { enabled: desktopLyricsMousePassthroughEnabled }
    },
  )

  ipcMain.handle(
    ipcChannels.desktopLyrics.isMousePassthroughEnabled,
    (): IpcResponse<'desktop-lyrics:is-mouse-passthrough-enabled'> => ({
      enabled: desktopLyricsMousePassthroughEnabled,
    }),
  )

  ipcMain.handle(
    ipcChannels.desktopLyrics.update,
    (_event, payload: DesktopLyricsPayload): IpcResponse<'desktop-lyrics:update'> => {
      latestPayload = payload
      sendLatestPayload()
      return { ok: true }
    },
  )
}
