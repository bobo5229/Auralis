import { BrowserWindow, screen } from 'electron'
import {
  computeMiniPlayerBodySize,
  getDefaultMiniPlayerBodySize,
  type MiniPlayerBodySize,
} from '@shared/constants/miniPlayer'
import { ipcChannels } from '@shared/ipc/channels'
import type { MiniPlayerPopoverDirection, MiniPlayerWindowState } from '@shared/ipc/contracts'
import {
  captureWindowRestoreSnapshot,
  clearMaximizeSession,
  leaveMaximizedState,
  markPseudoMaximized,
} from './windowMaximize'

interface WindowPreferences {
  bounds: Electron.Rectangle
  wasMaximized: boolean
  minimumSize: [number, number]
  maximumSize: [number, number]
  resizable: boolean
  maximizable: boolean
  alwaysOnTop: boolean
  /** OS window shadow (rectangular); disabled in mini so CSS radius can stand alone. */
  hasShadow: boolean
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
    window.once('closed', () => controllers.delete(window))
  }

  enter(): MiniPlayerWindowState {
    if (this.preferences) {
      return this.getState()
    }

    const snapshot = captureWindowRestoreSnapshot(this.window)
    const preferences: WindowPreferences = {
      bounds: snapshot.bounds,
      wasMaximized: snapshot.wasMaximized,
      minimumSize: toSizeTuple(this.window.getMinimumSize()),
      maximumSize: toSizeTuple(this.window.getMaximumSize()),
      resizable: this.window.isResizable(),
      maximizable: this.window.isMaximizable(),
      alwaysOnTop: this.window.isAlwaysOnTop(),
      hasShadow: this.window.hasShadow(),
    }
    this.preferences = preferences

    leaveMaximizedState(this.window)

    this.body = this.resolveBodySize(preferences.bounds)
    this.popover = { open: false, direction: this.getSuggestedPopoverDirection(), height: 0 }
    this.window.setResizable(false)
    this.window.setMaximizable(false)
    // Transparent rounded plaque: OS shadow is rectangular and reads as a second "container".
    this.window.setHasShadow(false)
    this.setFixedMiniPlayerSize(this.body.height)
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
    this.body = getDefaultMiniPlayerBodySize()

    this.window.setMinimumSize(...preferences.minimumSize)
    this.window.setMaximumSize(...preferences.maximumSize)
    this.window.setResizable(preferences.resizable)
    this.window.setMaximizable(preferences.maximizable)
    this.window.setHasShadow(preferences.hasShadow)
    this.window.setBounds(preferences.bounds)
    this.window.setAlwaysOnTop(preferences.alwaysOnTop)

    if (preferences.wasMaximized) {
      // Prefer native maximize; transparent fallback keeps green-dot toggle working.
      this.window.maximize()
      if (!this.window.isMaximized()) {
        const work = screen.getDisplayMatching(preferences.bounds).workArea
        this.window.setBounds(work)
        markPseudoMaximized(this.window, preferences.bounds)
      } else {
        clearMaximizeSession(this.window)
      }
    } else {
      clearMaximizeSession(this.window)
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
