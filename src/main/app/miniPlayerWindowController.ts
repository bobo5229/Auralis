import { BrowserWindow, screen } from 'electron'
import {
  computeMiniPlayerBodySize,
  getDefaultMiniPlayerBodySize,
  type MiniPlayerBodySize,
} from '@shared/constants/miniPlayer'
import { ipcChannels } from '@shared/ipc/channels'
import type { MiniPlayerPopoverDirection, MiniPlayerWindowState } from '@shared/ipc/contracts'
import {
  isScreenOccupying,
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
const UNLOCK_MAX_SIZE = 10000

export interface MiniPlayerWindowControllerOptions {
  leaveFullScreenTimeoutMs?: number
  unmaximizeTimeoutMs?: number
  boundsRetryDelayMs?: number
}

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
): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.isDestroyed()) {
      resolve(false)
      return
    }

    let settled = false
    const finish = (received: boolean): void => {
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
      resolve(received)
    }
    const onEvent = (): void => {
      finish(true)
    }
    const timer = setTimeout(() => {
      finish(false)
    }, timeoutMs)
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
  private miniCommitted = false
  private enterInFlight = false
  private popover: MiniPlayerPopover = { open: false, direction: 'below', height: 0 }
  private body: MiniPlayerBodySize = getDefaultMiniPlayerBodySize()
  private readonly leaveFullScreenTimeoutMs: number
  private readonly unmaximizeTimeoutMs: number
  private readonly boundsRetryDelayMs: number

  constructor(
    private readonly window: BrowserWindow,
    options: MiniPlayerWindowControllerOptions = {},
  ) {
    this.leaveFullScreenTimeoutMs = options.leaveFullScreenTimeoutMs ?? LEAVE_FULL_SCREEN_TIMEOUT_MS
    this.unmaximizeTimeoutMs = options.unmaximizeTimeoutMs ?? UNMAXIMIZE_TIMEOUT_MS
    this.boundsRetryDelayMs = options.boundsRetryDelayMs ?? BOUNDS_RETRY_DELAY_MS
    controllers.set(window, this)

    const { webContents } = window
    const onBeforeInput = (event: Electron.Event, input: Electron.Input): void => {
      if (this.shouldGuardNativeFullscreen() && input.type === 'keyDown' && input.key === 'F11') {
        event.preventDefault()
      }
    }
    const onEnterFullScreen = (): void => {
      if (
        this.shouldGuardNativeFullscreen() &&
        !this.window.isDestroyed() &&
        this.window.isFullScreen()
      ) {
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
    if (this.window.isDestroyed()) {
      return this.emitState()
    }

    if (this.miniCommitted && this.currentBoundsMatchMini()) {
      return this.getState()
    }

    if (this.enterInFlight) {
      return this.getState()
    }

    this.enterInFlight = true
    try {
      return await this.enterMiniPlayerGeometry()
    } finally {
      this.enterInFlight = false
    }
  }

  async restore(): Promise<MiniPlayerWindowState> {
    if (!this.preferences) {
      return this.getState()
    }

    // Clear mini mode before restoring fullscreen so the enter-full-screen guard
    // does not immediately cancel the restore.
    const preferences = this.preferences
    this.preferences = null
    this.miniCommitted = false
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
      Math.max(preferences.bounds.width, UNLOCK_MAX_SIZE),
      Math.max(preferences.bounds.height, UNLOCK_MAX_SIZE),
    )

    this.window.setBounds(preferences.bounds)

    if (!miniPlayerBoundsApplied(this.window.getBounds(), preferences.bounds)) {
      await delay(this.boundsRetryDelayMs)
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
      mode: this.miniCommitted ? 'mini' : 'normal',
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

  private shouldGuardNativeFullscreen(): boolean {
    return this.preferences !== null || this.miniCommitted
  }

  private currentBoundsMatchMini(): boolean {
    return miniPlayerBoundsApplied(this.window.getBounds(), {
      width: this.body.width,
      height: this.body.height,
    })
  }

  private isCurrentlyScreenOccupying(): boolean {
    if (this.window.isDestroyed()) {
      return false
    }

    const bounds = this.window.getBounds()
    return isScreenOccupying(
      this.window.isFullScreen(),
      bounds,
      screen.getDisplayMatching(bounds).bounds,
    )
  }

  private async enterMiniPlayerGeometry(): Promise<MiniPlayerWindowState> {
    const currentBounds = this.window.getBounds()
    const occupiesDisplay = windowOccupiesDisplay(
      currentBounds,
      screen.getDisplayMatching(currentBounds).bounds,
    )
    const wasFullScreen = this.window.isFullScreen()
    const wasMaximized = this.window.isMaximized()

    if (!this.preferences) {
      this.preferences = {
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
    }

    const preferences = this.preferences
    await this.exitScreenOccupyingMode()
    if (this.window.isDestroyed()) {
      return this.emitState()
    }

    this.body = this.resolveBodySize(preferences.bounds)
    this.popover = { open: false, direction: this.getSuggestedPopoverDirection(), height: 0 }
    const applied = await this.applyMiniPlayerGeometry(
      this.getClampedBodyBounds(preferences.bounds),
    )
    if (this.window.isDestroyed()) {
      return this.emitState()
    }

    if (!applied) {
      return this.restore()
    }

    this.window.setTitleBarOverlay(MINI_PLAYER_TITLE_BAR_OVERLAY)
    this.window.setAlwaysOnTop(true, 'floating')
    this.window.moveTop()
    this.miniCommitted = true
    return this.emitState()
  }

  /**
   * Windows reports `isFullScreen() === false` immediately after `setFullScreen(false)`
   * while DWM/HWND can still be exclusive and occupy the display. Attach
   * `leave-full-screen` before exiting whenever the window occupies the display,
   * including the `occupiesDisplay && !isFullScreen()` leftover. After the event
   * or timeout, re-read bounds / fullscreen / maximized; a false API flag is not
   * proof that exclusive mode has ended.
   */
  private async exitScreenOccupyingMode(): Promise<void> {
    if (this.window.isDestroyed()) {
      return
    }

    if (this.isCurrentlyScreenOccupying()) {
      const leftFullScreen = waitForWindowEvent(
        this.window,
        'leave-full-screen',
        this.leaveFullScreenTimeoutMs,
      )
      this.window.setFullScreen(false)
      await leftFullScreen
    }

    if (this.window.isDestroyed()) {
      return
    }

    if (this.window.isMaximized()) {
      const unmaximized = waitForWindowEvent(this.window, 'unmaximize', this.unmaximizeTimeoutMs)
      this.window.unmaximize()
      await unmaximized
    }
  }

  /**
   * Unlock min/max before shrinking. Setting min===max on a still-large window is
   * ignored on Windows and pins the oversized frame. Only lock after getBounds()
   * matches the target. Hide/show is a last resort; verify bounds after show.
   */
  private async applyMiniPlayerGeometry(target: Electron.Rectangle): Promise<boolean> {
    if (this.window.isDestroyed()) {
      return false
    }

    this.unlockWindowConstraints()
    this.window.setMaximizable(false)
    this.window.setHasShadow(false)

    await this.exitScreenOccupyingMode()
    if (this.window.isDestroyed()) {
      return false
    }

    this.window.setBounds(target)
    if (this.geometryApplied(target)) {
      this.lockMiniPlayerGeometry(target.height)
      return true
    }

    await delay(this.boundsRetryDelayMs)
    if (this.window.isDestroyed()) {
      return false
    }

    this.unlockWindowConstraints()
    await this.exitScreenOccupyingMode()
    if (this.window.isDestroyed()) {
      return false
    }

    this.window.setBounds(target)
    if (this.geometryApplied(target)) {
      this.lockMiniPlayerGeometry(target.height)
      return true
    }

    const wasVisible = this.window.isVisible()
    if (wasVisible) {
      this.window.hide()
    }
    this.unlockWindowConstraints()
    this.window.setBounds(target)
    if (wasVisible && !this.window.isDestroyed()) {
      this.window.show()
    }
    if (this.window.isDestroyed()) {
      return false
    }

    if (this.geometryApplied(target)) {
      this.lockMiniPlayerGeometry(target.height)
      return true
    }

    return false
  }

  private geometryApplied(target: Electron.Rectangle): boolean {
    return (
      !this.window.isMaximized() &&
      !this.isCurrentlyScreenOccupying() &&
      miniPlayerBoundsApplied(this.window.getBounds(), target)
    )
  }

  private unlockWindowConstraints(): void {
    this.window.setResizable(true)
    this.window.setFullScreenable(true)
    this.window.setMinimumSize(0, 0)
    this.window.setMaximumSize(UNLOCK_MAX_SIZE, UNLOCK_MAX_SIZE)
  }

  private lockMiniPlayerGeometry(height: number): void {
    this.setFixedMiniPlayerSize(height)
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
