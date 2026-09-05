import { BrowserWindow, app, ipcMain, screen } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ipcChannels } from '@shared/ipc/channels'
import type { DesktopLyricsPayload } from '@shared/types/desktopLyrics'
import type { IpcResponse } from '@shared/ipc/contracts'
import {
  parseDesktopLyricsSavedBounds,
  resolveDesktopLyricsRestoreBounds,
  type DesktopLyricsSavedBounds,
} from './desktopLyricsBounds'
import { secureRendererWindow } from './webContentsSecurity'

let desktopLyricsWindow: BrowserWindow | null = null
let desktopLyricsEnabled = false
let desktopLyricsSuppressed = false
let desktopLyricsMousePassthroughEnabled = true
let latestPayload: DesktopLyricsPayload | null = null
let persistBoundsTimer: ReturnType<typeof setTimeout> | null = null
let displayListenersBound = false

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

  if (desktopLyricsMousePassthroughEnabled) {
    window.setFocusable(false)
    window.setIgnoreMouseEvents(true, { forward: true })
  } else {
    window.setIgnoreMouseEvents(false)
    window.setFocusable(true)
  }
}

function sendLatestPayload(): void {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed() || !latestPayload) return
  desktopLyricsWindow.webContents.send(ipcChannels.desktopLyrics.changed, latestPayload)
}

function sendMousePassthroughState(): void {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return
  desktopLyricsWindow.webContents.send(
    ipcChannels.desktopLyrics.mousePassthroughChanged,
    desktopLyricsMousePassthroughEnabled,
  )
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

function desktopLyricsBoundsFilePath(): string {
  return join(app.getPath('userData'), 'desktop-lyrics-bounds.json')
}

function loadSavedDesktopLyricsBounds(): DesktopLyricsSavedBounds | null {
  try {
    const filePath = desktopLyricsBoundsFilePath()
    if (!existsSync(filePath)) return null
    return parseDesktopLyricsSavedBounds(JSON.parse(readFileSync(filePath, 'utf8')))
  } catch {
    return null
  }
}

function persistDesktopLyricsBounds(): void {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return

  const bounds = desktopLyricsWindow.getBounds()
  const display = screen.getDisplayMatching(bounds)
  const saved: DesktopLyricsSavedBounds = {
    x: bounds.x,
    y: bounds.y,
    displayId: display.id,
  }

  try {
    writeFileSync(desktopLyricsBoundsFilePath(), `${JSON.stringify(saved)}\n`, 'utf8')
  } catch {
    // Persistence is best-effort; a failed write must not break lyrics.
  }
}

function schedulePersistDesktopLyricsBounds(): void {
  if (persistBoundsTimer) {
    clearTimeout(persistBoundsTimer)
  }

  persistBoundsTimer = setTimeout(() => {
    persistBoundsTimer = null
    persistDesktopLyricsBounds()
  }, 250)
}

function listDesktopLyricsDisplays() {
  return screen.getAllDisplays().map((display) => ({
    id: display.id,
    workArea: display.workArea,
  }))
}

function resolveCurrentDesktopLyricsBounds() {
  const saved =
    desktopLyricsWindow && !desktopLyricsWindow.isDestroyed()
      ? {
          x: desktopLyricsWindow.getBounds().x,
          y: desktopLyricsWindow.getBounds().y,
          displayId: screen.getDisplayMatching(desktopLyricsWindow.getBounds()).id,
        }
      : loadSavedDesktopLyricsBounds()

  return resolveDesktopLyricsRestoreBounds({
    saved,
    displays: listDesktopLyricsDisplays(),
  })
}

function relocateDesktopLyricsWindow(): void {
  if (!desktopLyricsWindow || desktopLyricsWindow.isDestroyed()) return
  desktopLyricsWindow.setBounds(resolveCurrentDesktopLyricsBounds())
  persistDesktopLyricsBounds()
}

function bindDesktopLyricsDisplayListeners(): void {
  if (displayListenersBound) return
  displayListenersBound = true
  screen.on('display-metrics-changed', relocateDesktopLyricsWindow)
  screen.on('display-added', relocateDesktopLyricsWindow)
  screen.on('display-removed', relocateDesktopLyricsWindow)
}

function syncDesktopLyricsWindowVisibility(): void {
  if (!desktopLyricsEnabled || desktopLyricsSuppressed) {
    persistDesktopLyricsBounds()
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

  const bounds = resolveCurrentDesktopLyricsBounds()

  desktopLyricsWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
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
  desktopLyricsWindow.on('moved', schedulePersistDesktopLyricsBounds)
  desktopLyricsWindow.on('closed', () => {
    if (persistBoundsTimer) {
      clearTimeout(persistBoundsTimer)
      persistBoundsTimer = null
    }
    persistDesktopLyricsBounds()
    desktopLyricsWindow = null
  })

  loadDesktopLyricsRenderer(desktopLyricsWindow)

  return desktopLyricsWindow
}

export function registerDesktopLyricsIpcHandlers(): void {
  bindDesktopLyricsDisplayListeners()

  ipcMain.on(ipcChannels.desktopLyrics.ready, (event) => {
    if (event.sender === desktopLyricsWindow?.webContents) {
      sendLatestPayload()
      sendMousePassthroughState()
    }
  })

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
    ipcChannels.desktopLyrics.setSuppressed,
    (
      _event,
      { suppressed }: { suppressed: boolean },
    ): IpcResponse<'desktop-lyrics:set-suppressed'> => {
      desktopLyricsSuppressed = suppressed
      syncDesktopLyricsWindowVisibility()
      return { ok: true }
    },
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

export function disposeDesktopLyricsWindow(): void {
  desktopLyricsEnabled = false
  desktopLyricsSuppressed = false
  if (persistBoundsTimer) {
    clearTimeout(persistBoundsTimer)
    persistBoundsTimer = null
  }
  persistDesktopLyricsBounds()
  if (desktopLyricsWindow && !desktopLyricsWindow.isDestroyed()) {
    desktopLyricsWindow.close()
  }
  desktopLyricsWindow = null
  latestPayload = null
  broadcastVisibility(false)
}
