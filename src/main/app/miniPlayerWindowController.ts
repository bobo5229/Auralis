import { BrowserWindow, screen } from 'electron'
import { ipcChannels } from '@shared/ipc/channels'
import type { MiniPlayerPopoverDirection, MiniPlayerWindowState } from '@shared/ipc/contracts'

const MINI_PLAYER_WIDTH = 440
const MINI_PLAYER_HEIGHT = 146

interface WindowPreferences {
  bounds: Electron.Rectangle
  wasMaximized: boolean
  minimumSize: [number, number]
  maximumSize: [number, number]
  resizable: boolean
  maximizable: boolean
  alwaysOnTop: boolean
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

  constructor(private readonly window: BrowserWindow) {
    controllers.set(window, this)
    window.once('closed', () => controllers.delete(window))
  }

  enter(): MiniPlayerWindowState {
    if (this.preferences) {
      return this.getState()
    }

    const wasMaximized = this.window.isMaximized()
    const preferences: WindowPreferences = {
      bounds: wasMaximized ? this.window.getNormalBounds() : this.window.getBounds(),
      wasMaximized,
      minimumSize: toSizeTuple(this.window.getMinimumSize()),
      maximumSize: toSizeTuple(this.window.getMaximumSize()),
      resizable: this.window.isResizable(),
      maximizable: this.window.isMaximizable(),
      alwaysOnTop: this.window.isAlwaysOnTop(),
    }
    this.preferences = preferences

    if (wasMaximized) {
      this.window.unmaximize()
    }

    this.popover = { open: false, direction: this.getSuggestedPopoverDirection(), height: 0 }
    this.window.setResizable(false)
    this.window.setMaximizable(false)
    this.setFixedMiniPlayerSize(MINI_PLAYER_HEIGHT)
    this.window.setBounds(this.getClampedBodyBounds(preferences.bounds))
    this.window.setAlwaysOnTop(true, 'floating')
    this.window.moveTop()

    return this.emitState()
  }

  restore(): MiniPlayerWindowState {
    if (!this.preferences) {
      return this.getState()
    }

    const preferences = this.preferences
    this.preferences = null
    this.popover = { open: false, direction: 'below', height: 0 }

    this.window.setMinimumSize(...preferences.minimumSize)
    this.window.setMaximumSize(...preferences.maximumSize)
    this.window.setResizable(preferences.resizable)
    this.window.setMaximizable(preferences.maximizable)
    this.window.setBounds(preferences.bounds)
    this.window.setAlwaysOnTop(preferences.alwaysOnTop)

    if (preferences.wasMaximized) {
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
        this.setFixedMiniPlayerSize(MINI_PLAYER_HEIGHT)
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
      workArea.y + workArea.height - (bodyBounds.y + MINI_PLAYER_HEIGHT),
    )
    const resolvedDirection = this.resolveDirection(direction, availableAbove, availableBelow)
    const availableHeight = resolvedDirection === 'above' ? availableAbove : availableBelow
    const height = Math.min(wantedHeight, availableHeight)

    this.popover = { open: height > 0, direction: resolvedDirection, height }
    const y = resolvedDirection === 'above' ? bodyBounds.y - height : bodyBounds.y
    this.setFixedMiniPlayerSize(MINI_PLAYER_HEIGHT + height)
    this.window.setBounds({
      x: bodyBounds.x,
      y,
      width: MINI_PLAYER_WIDTH,
      height: MINI_PLAYER_HEIGHT + height,
    })

    return this.emitState()
  }

  getState(): MiniPlayerWindowState {
    const suggestedPopoverDirection = this.getSuggestedPopoverDirection()
    return {
      mode: this.preferences ? 'mini' : 'normal',
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

  private getBodyBounds(): Electron.Rectangle {
    const bounds = this.window.getBounds()
    if (this.popover.open && this.popover.direction === 'above') {
      return { ...bounds, y: bounds.y + this.popover.height, height: MINI_PLAYER_HEIGHT }
    }

    return { ...bounds, height: MINI_PLAYER_HEIGHT }
  }

  private setFixedMiniPlayerSize(height: number): void {
    this.window.setMinimumSize(MINI_PLAYER_WIDTH, height)
    this.window.setMaximumSize(MINI_PLAYER_WIDTH, height)
  }

  private getClampedBodyBounds(source: Electron.Rectangle): Electron.Rectangle {
    const display = screen.getDisplayMatching(source)
    const workArea = display.workArea
    const maxX = workArea.x + Math.max(0, workArea.width - MINI_PLAYER_WIDTH)
    const maxY = workArea.y + Math.max(0, workArea.height - MINI_PLAYER_HEIGHT)
    return {
      x: Math.min(Math.max(source.x, workArea.x), maxX),
      y: Math.min(Math.max(source.y, workArea.y), maxY),
      width: MINI_PLAYER_WIDTH,
      height: MINI_PLAYER_HEIGHT,
    }
  }

  private getSuggestedPopoverDirection(): MiniPlayerPopoverDirection {
    if (!this.preferences) {
      return 'below'
    }

    const bodyBounds = this.getBodyBounds()
    const workArea = screen.getDisplayMatching(bodyBounds).workArea
    const availableAbove = bodyBounds.y - workArea.y
    const availableBelow = workArea.y + workArea.height - (bodyBounds.y + MINI_PLAYER_HEIGHT)
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
