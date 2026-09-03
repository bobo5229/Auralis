import { BrowserWindow, screen } from 'electron'
import {
  computeMiniPlayerBodySize,
  getDefaultMiniPlayerBodySize,
  type MiniPlayerBodySize,
} from '@shared/constants/miniPlayer'
import { ipcChannels } from '@shared/ipc/channels'
import type { MiniPlayerPopoverDirection, MiniPlayerWindowState } from '@shared/ipc/contracts'
import {
  miniPlayerBoundsApplied,
  resolveMiniPlayerSourceBounds,
  windowOccupiesDisplay,
} from './miniPlayerWindowBounds'

interface WindowPreferences {
  bounds: Electron.Rectangle
  wasFullScreen: boolean
  wasMaximized: boolean
  fullscreenable: boolean
  minimumSize: [number, number]
  maximumSize: [number, number]
  resizable: boolean
  maximizable: boolean
  alwaysOnTop: boolean
  /** OS window shadow (rectangular); disabled in mini so CSS radius can stand alone. */
  hasShadow: boolean
}

const LEAVE_FULL_SCREEN_TIMEOUT_MS = 1000
const UNMAXIMIZE_TIMEOUT_MS = 500
const BOUNDS_RETRY_DELAY_MS = 50

const MAIN_WINDOW_TITLE_BAR_OVERLAY = {
  color: '#00000000',
  symbolColor: '#e1ddd6',
  height: 36,
} as const

const MINI_PLAYER_TITLE_BAR_OVERLAY = {
  color: '#00000000',
  symbolColor: '#00000000',
  height: 0,
} as const

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function waitForWindowEvent(
  window: BrowserWindow,
  eventName: 'leave-full-screen' | 'unmaximize',
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve) => {
    if (window.isDestroyed()) {
      resolve()
      return
    }

    let settled = false
    const finish = (): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      if (eventName === 'leave-full-screen') {
        window.removeListener('leave-full-screen', onEvent)
      } else {
        window.removeListener('unmaximize', onEvent)
      }
      resolve()
    }
    const onEvent = (): void => {
      finish()
    }
    const timer = setTimeout(finish, timeoutMs)
    if (eventName === 'leave-full-screen') {
      window.once('leave-full-screen', onEvent)
    } else {
      window.once('unmaximize', onEvent)
    }
  })
}

interface MiniPlayerPopover {
  open: boolean
  direction: MiniPlayerPopoverDirection
  height: number
}

const controllers = new WeakMap<BrowserWindow, MiniPlayerWindowController>()

function toSizeTuple(size: number[]): [number, number] {
  return [size[0] ?? 0, size[1] ?? 0]
}

export class MiniPlayerWindowController {
  private preferences: WindowPreferences | null = null
  private popover: MiniPlayerPopover = { open: false, direction: 'below', height: 0 }
  private body: MiniPlayerBodySize = getDefaultMiniPlayerBodySize()

  constructor(private readonly window: BrowserWindow) {
    controllers.set(window, this)

    const { webContents } = window
    const onBeforeInput = (event: Electron.Event, input: Electron.Input): void => {
      if (this.preferences && input.type === 'keyDown' && input.key === 'F11') {
        event.preventDefault()
      }
    }
    const onEnterFullScreen = (): void => {
      if (this.preferences && !this.window.isDestroyed() && this.window.isFullScreen()) {
        this.window.setFullScreen(false)
      }
    }

    webContents.on('before-input-event', onBeforeInput)
    window.on('enter-full-screen', onEnterFullScreen)

    window.once('closed', () => {
      controllers.delete(window)
      if (!webContents.isDestroyed()) {
        webContents.removeListener('before-input-event', onBeforeInput)
      }
      window.removeListener('enter-full-screen', onEnterFullScreen)
    })
  }

  async enter(): Promise<MiniPlayerWindowState> {
    if (this.preferences) {
      return this.getState()
    }

    const currentBounds = this.window.getBounds()
    const occupiesDisplay = windowOccupiesDisplay(
      currentBounds,
      screen.getDisplayMatching(currentBounds).bounds,
    )
    const wasFullScreen = this.window.isFullScreen()
    const wasMaximized = this.window.isMaximized()
    const preferences: WindowPreferences = {
      bounds: resolveMiniPlayerSourceBounds(
        wasFullScreen || occupiesDisplay,
        wasMaximized,
        currentBounds,
        this.window.getNormalBounds(),
      ),
      wasFullScreen,
      wasMaximized,
      fullscreenable: this.window.isFullScreenable(),
      minimumSize: toSizeTuple(this.window.getMinimumSize()),
      maximumSize: toSizeTuple(this.window.getMaximumSize()),
      resizable: this.window.isResizable(),
      maximizable: this.window.isMaximizable(),
      alwaysOnTop: this.window.isAlwaysOnTop(),
      hasShadow: this.window.hasShadow(),
    }
    this.preferences = preferences

    await this.exitScreenOccupyingMode(wasFullScreen || occupiesDisplay)
    if (this.window.isDestroyed()) {
      return this.emitState()
    }

    this.body = this.resolveBodySize(preferences.bounds)
    this.popover = { open: false, direction: this.getSuggestedPopoverDirection(), height: 0 }
    this.window.setTitleBarOverlay(MINI_PLAYER_TITLE_BAR_OVERLAY)
    await this.applyMiniPlayerGeometry(this.getClampedBodyBounds(preferences.bounds))
    if (this.window.isDestroyed()) {
      return this.emitState()
    }

    this.window.setAlwaysOnTop(true, 'floating')
    this.window.moveTop()

    return this.emitState()
  }

  async restore(): Promise<MiniPlayerWindowState> {
    if (!this.preferences) {
      return this.getState()
    }

    // Clear mini mode before restoring fullscreen so the enter-full-screen guard
    // does not immediately cancel the restore.
    const preferences = this.preferences
    this.preferences = null
    this.popover = { open: false, direction: 'below', height: 0 }
    this.body = getDefaultMiniPlayerBodySize()

    if (this.window.isDestroyed()) {
      return this.emitState()
    }

    this.window.setAlwaysOnTop(preferences.alwaysOnTop)
    this.window.setResizable(true)
    this.window.setMaximizable(preferences.maximizable)
    this.window.setFullScreenable(preferences.fullscreenable)
    this.window.setHasShadow(preferences.hasShadow)
    this.window.setTitleBarOverlay(MAIN_WINDOW_TITLE_BAR_OVERLAY)
    this.window.setMinimumSize(0, 0)
    this.window.setMaximumSize(
      Math.max(preferences.bounds.width, 10000),
      Math.max(preferences.bounds.height, 10000),
    )

    this.window.setBounds(preferences.bounds)

    if (!miniPlayerBoundsApplied(this.window.getBounds(), preferences.bounds)) {
      await delay(BOUNDS_RETRY_DELAY_MS)
      if (this.window.isDestroyed()) {
        return this.emitState()
      }
      this.window.setBounds(preferences.bounds)
    }

    if (this.window.isDestroyed()) {
      return this.emitState()
    }

    this.window.setMinimumSize(...preferences.minimumSize)
    this.window.setMaximumSize(...preferences.maximumSize)
    this.window.setResizable(preferences.resizable)

    if (preferences.wasFullScreen) {
      this.window.setFullScreen(true)
    } else if (preferences.wasMaximized) {
      this.window.maximize()
    }

    return this.emitState()
  }

  setPopover(
    open: boolean,
    direction: MiniPlayerPopoverDirection,
    requestedHeight: number,
  ): MiniPlayerWindowState {
    if (!this.preferences || !open) {
      const bodyBounds = this.preferences ? this.getBodyBounds() : null
      this.popover = { open: false, direction, height: 0 }
      if (bodyBounds) {
        this.setFixedMiniPlayerSize(this.body.height)
        this.window.setBounds(this.getClampedBodyBounds(bodyBounds))
      }
      return this.emitState()
    }

    const bodyBounds = this.getBodyBounds()
    const display = screen.getDisplayMatching(bodyBounds)
    const workArea = display.workArea
    const wantedHeight = Math.max(0, Math.floor(requestedHeight))
    const availableAbove = Math.max(0, bodyBounds.y - workArea.y)
    const availableBelow = Math.max(
      0,
      workArea.y + workArea.height - (bodyBounds.y + this.body.height),
    )
    const resolvedDirection = this.resolveDirection(direction, availableAbove, availableBelow)
    const availableHeight = resolvedDirection === 'above' ? availableAbove : availableBelow
    const height = Math.min(wantedHeight, availableHeight)

    this.popover = { open: height > 0, direction: resolvedDirection, height }
    const y = resolvedDirection === 'above' ? bodyBounds.y - height : bodyBounds.y
    this.setFixedMiniPlayerSize(this.body.height + height)
    this.window.setBounds({
      x: bodyBounds.x,
      y,
      width: this.body.width,
      height: this.body.height + height,
    })

    return this.emitState()
  }

  getState(): MiniPlayerWindowState {
    const suggestedPopoverDirection = this.getSuggestedPopoverDirection()
    return {
      mode: this.preferences ? 'mini' : 'normal',
      body: { ...this.body },
      popover: { ...this.popover },
      suggestedPopoverDirection,
    }
  }

  private emitState(): MiniPlayerWindowState {
    const state = this.getState()
    if (!this.window.isDestroyed() && !this.window.webContents.isDestroyed()) {
      this.window.webContents.send(ipcChannels.window.miniPlayerStateChanged, state)
    }
    return state
  }

  /**
   * Windows reports `isFullScreen() === false` immediately after `setFullScreen(false)`
   * while the shell is still exclusive. Skipping the leave event then locking min/max
   * leaves a fullscreen-sized window with the mini UI in the corner.
   */
  private async exitScreenOccupyingMode(shouldLeaveFullScreen: boolean): Promise<void> {
    if (this.window.isDestroyed()) {
      return
    }

    if (this.window.isFullScreen()) {
      const leftFullScreen = waitForWindowEvent(
        this.window,
        'leave-full-screen',
        LEAVE_FULL_SCREEN_TIMEOUT_MS,
      )
      this.window.setFullScreen(false)
      await leftFullScreen
    } else if (shouldLeaveFullScreen) {
      this.window.setFullScreen(false)
    }

    if (this.window.isDestroyed()) {
      return
    }

    if (this.window.isMaximized()) {
      const unmaximized = waitForWindowEvent(this.window, 'unmaximize', UNMAXIMIZE_TIMEOUT_MS)
      this.window.unmaximize()
      await unmaximized
    }
  }

  private async applyMiniPlayerGeometry(target: Electron.Rectangle): Promise<void> {
    if (this.window.isDestroyed()) {
      return
    }

    // Unlock constraints before shrinking. Setting min=max on a still-large
    // non-resizable window is ignored on Windows.
    this.window.setResizable(true)
    this.window.setMaximizable(false)
    this.window.setHasShadow(false)
    this.window.setMinimumSize(target.width, target.height)
    this.window.setMaximumSize(Math.max(target.width, 10000), Math.max(target.height, 10000))
    this.window.setBounds(target)

    if (!miniPlayerBoundsApplied(this.window.getBounds(), target)) {
      await delay(BOUNDS_RETRY_DELAY_MS)
      if (this.window.isDestroyed()) {
        return
      }
      if (this.window.isFullScreen()) {
        this.window.setFullScreen(false)
        await waitForWindowEvent(this.window, 'leave-full-screen', LEAVE_FULL_SCREEN_TIMEOUT_MS)
      }
      if (this.window.isDestroyed()) {
        return
      }
      const wasVisible = this.window.isVisible()
      if (wasVisible) {
        this.window.hide()
      }
      this.window.setBounds(target)
      if (wasVisible && !this.window.isDestroyed()) {
        this.window.show()
      }
    }

    if (this.window.isDestroyed()) {
      return
    }

    this.setFixedMiniPlayerSize(target.height)
    this.window.setResizable(false)
    this.window.setFullScreenable(false)
  }

  private resolveBodySize(source: Electron.Rectangle): MiniPlayerBodySize {
    const workArea = screen.getDisplayMatching(source).workArea
    return computeMiniPlayerBodySize(workArea.width, workArea.height)
  }

  private getBodyBounds(): Electron.Rectangle {
    const bounds = this.window.getBounds()
    if (this.popover.open && this.popover.direction === 'above') {
      return { ...bounds, y: bounds.y + this.popover.height, height: this.body.height }
    }

    return { ...bounds, height: this.body.height, width: this.body.width }
  }

  private setFixedMiniPlayerSize(height: number): void {
    this.window.setMinimumSize(this.body.width, height)
    this.window.setMaximumSize(this.body.width, height)
  }

  private getClampedBodyBounds(source: Electron.Rectangle): Electron.Rectangle {
    const display = screen.getDisplayMatching(source)
    const workArea = display.workArea
    const maxX = workArea.x + Math.max(0, workArea.width - this.body.width)
    const maxY = workArea.y + Math.max(0, workArea.height - this.body.height)
    return {
      x: Math.min(Math.max(source.x, workArea.x), maxX),
      y: Math.min(Math.max(source.y, workArea.y), maxY),
      width: this.body.width,
      height: this.body.height,
    }
  }

  private getSuggestedPopoverDirection(): MiniPlayerPopoverDirection {
    if (!this.preferences) {
      return 'below'
    }

    const bodyBounds = this.getBodyBounds()
    const workArea = screen.getDisplayMatching(bodyBounds).workArea
    const availableAbove = bodyBounds.y - workArea.y
    const availableBelow = workArea.y + workArea.height - (bodyBounds.y + this.body.height)
    return availableAbove > availableBelow ? 'above' : 'below'
  }

  private resolveDirection(
    requestedDirection: MiniPlayerPopoverDirection,
    availableAbove: number,
    availableBelow: number,
  ): MiniPlayerPopoverDirection {
    const requestedSpace = requestedDirection === 'above' ? availableAbove : availableBelow
    const alternateSpace = requestedDirection === 'above' ? availableBelow : availableAbove
    if (alternateSpace > requestedSpace) {
      return requestedDirection === 'above' ? 'below' : 'above'
    }
    return requestedDirection
  }
}

export function getMiniPlayerWindowController(
  window: BrowserWindow,
): MiniPlayerWindowController | undefined {
  return controllers.get(window)
}
