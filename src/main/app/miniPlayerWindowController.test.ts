import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { getDefaultMiniPlayerBodySize } from '@shared/constants/miniPlayer'
import { ipcChannels } from '@shared/ipc/channels'
import { MiniPlayerWindowController } from './miniPlayerWindowController'

const { DISPLAY } = vi.hoisted(() => ({
  DISPLAY: {
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  },
}))

vi.mock('electron', () => ({
  BrowserWindow: class {},
  screen: {
    getDisplayMatching: () => DISPLAY,
  },
}))

const NORMAL_BOUNDS = { x: 100, y: 80, width: 1180, height: 760 }
const MINI_BODY = getDefaultMiniPlayerBodySize()
const SHORT_TIMEOUTS = {
  leaveFullScreenTimeoutMs: 30,
  unmaximizeTimeoutMs: 30,
  boundsRetryDelayMs: 5,
}

type LeaveFullScreenBehavior = 'emit' | 'never'
type UnmaximizeBehavior = 'emit' | 'never'

interface FakeWindowOptions {
  bounds?: Electron.Rectangle
  normalBounds?: Electron.Rectangle
  fullScreen?: boolean
  exclusive?: boolean
  maximized?: boolean
  leaveFullScreen?: LeaveFullScreenBehavior
  unmaximize?: UnmaximizeBehavior
  restoreExclusiveOnShow?: boolean
}

class FakeMiniPlayerWindow extends EventEmitter {
  bounds: Electron.Rectangle
  normalBounds: Electron.Rectangle
  visible = true
  destroyed = false
  resizable = true
  maximizable = true
  fullscreenable = true
  alwaysOnTop = false
  shadow = true
  minSize: [number, number] = [900, 620]
  maxSize: [number, number] = [0, 0]
  titleBarOverlay: unknown = null
  setBoundsCalls: Electron.Rectangle[] = []
  setFullScreenCalls: boolean[] = []
  hideCount = 0
  showCount = 0
  moveTop = vi.fn()
  fullScreen: boolean
  exclusive: boolean
  maximized: boolean
  readonly webContents: {
    isDestroyed: () => boolean
    on: ReturnType<typeof vi.fn>
    removeListener: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
    beforeInput?: (event: Electron.Event, input: Electron.Input) => void
  }

  private readonly leaveFullScreen: LeaveFullScreenBehavior
  private readonly unmaximizeBehavior: UnmaximizeBehavior
  private readonly restoreExclusiveOnShow: boolean

  constructor(options: FakeWindowOptions = {}) {
    super()
    this.normalBounds = { ...(options.normalBounds ?? options.bounds ?? NORMAL_BOUNDS) }
    this.fullScreen = options.fullScreen ?? false
    this.exclusive = options.exclusive ?? this.fullScreen
    this.maximized = options.maximized ?? false
    this.leaveFullScreen = options.leaveFullScreen ?? (this.exclusive ? 'never' : 'emit')
    this.unmaximizeBehavior = options.unmaximize ?? 'emit'
    this.restoreExclusiveOnShow = options.restoreExclusiveOnShow ?? false
    this.bounds = { ...(options.bounds ?? this.normalBounds) }
    if (this.exclusive) {
      this.bounds = { ...DISPLAY.bounds }
    } else if (this.maximized) {
      this.bounds = { ...DISPLAY.workArea }
    }

    const on = vi.fn()
    this.webContents = {
      isDestroyed: () => false,
      on,
      removeListener: vi.fn(),
      send: vi.fn(),
    }
    on.mockImplementation(
      (event: string, listener: (event: Electron.Event, input: Electron.Input) => void) => {
        if (event === 'before-input-event') {
          this.webContents.beforeInput = listener
        }
      },
    )
  }

  isDestroyed(): boolean {
    return this.destroyed
  }

  getBounds(): Electron.Rectangle {
    return { ...this.bounds }
  }

  getNormalBounds(): Electron.Rectangle {
    return { ...this.normalBounds }
  }

  isFullScreen(): boolean {
    return this.fullScreen
  }

  isMaximized(): boolean {
    return this.maximized
  }

  isVisible(): boolean {
    return this.visible
  }

  isResizable(): boolean {
    return this.resizable
  }

  isMaximizable(): boolean {
    return this.maximizable
  }

  isFullScreenable(): boolean {
    return this.fullscreenable
  }

  isAlwaysOnTop(): boolean {
    return this.alwaysOnTop
  }

  hasShadow(): boolean {
    return this.shadow
  }

  getMinimumSize(): number[] {
    return [...this.minSize]
  }

  getMaximumSize(): number[] {
    return [...this.maxSize]
  }

  setFullScreen(value: boolean): void {
    this.setFullScreenCalls.push(value)
    if (value) {
      this.fullScreen = true
      this.exclusive = true
      this.bounds = { ...DISPLAY.bounds }
      this.emit('enter-full-screen')
      return
    }

    this.fullScreen = false
    if (this.leaveFullScreen === 'emit') {
      this.exclusive = false
      this.bounds = { ...this.normalBounds }
      queueMicrotask(() => {
        this.emit('leave-full-screen')
      })
    }
  }

  unmaximize(): void {
    if (this.unmaximizeBehavior === 'never') {
      return
    }
    this.maximized = false
    this.bounds = { ...this.normalBounds }
    queueMicrotask(() => {
      this.emit('unmaximize')
    })
  }

  maximize(): void {
    this.maximized = true
    this.bounds = { ...DISPLAY.workArea }
  }

  setBounds(rect: Electron.Rectangle): void {
    this.setBoundsCalls.push({ ...rect })
    if (this.exclusive || this.maximized) {
      return
    }
    if (this.minSize[0] > 0 && rect.width < this.minSize[0]) {
      return
    }
    if (this.minSize[1] > 0 && rect.height < this.minSize[1]) {
      return
    }
    this.bounds = { ...rect }
  }

  hide(): void {
    this.hideCount += 1
    this.visible = false
    this.exclusive = false
  }

  show(): void {
    this.showCount += 1
    this.visible = true
    if (this.restoreExclusiveOnShow) {
      this.exclusive = true
      this.bounds = { ...DISPLAY.bounds }
    }
  }

  setResizable(value: boolean): void {
    this.resizable = value
  }

  setMaximizable(value: boolean): void {
    this.maximizable = value
  }

  setFullScreenable(value: boolean): void {
    this.fullscreenable = value
  }

  setAlwaysOnTop(value: boolean): void {
    this.alwaysOnTop = value
  }

  setHasShadow(value: boolean): void {
    this.shadow = value
  }

  setMinimumSize(width: number, height: number): void {
    this.minSize = [width, height]
  }

  setMaximumSize(width: number, height: number): void {
    this.maxSize = [width, height]
  }

  setTitleBarOverlay(overlay: unknown): void {
    this.titleBarOverlay = overlay
  }

  forceBounds(bounds: Electron.Rectangle): void {
    this.bounds = { ...bounds }
  }
}

function createController(window: FakeMiniPlayerWindow): MiniPlayerWindowController {
  return new MiniPlayerWindowController(window as unknown as BrowserWindow, SHORT_TIMEOUTS)
}

function isMiniSizeLocked(window: FakeMiniPlayerWindow): boolean {
  return (
    window.minSize[0] === MINI_BODY.width &&
    window.minSize[1] === MINI_BODY.height &&
    window.maxSize[0] === MINI_BODY.width &&
    window.maxSize[1] === MINI_BODY.height &&
    window.resizable === false
  )
}

function lastEmittedMode(window: FakeMiniPlayerWindow): string | undefined {
  const calls = window.webContents.send.mock.calls as Array<[string, { mode: string }]>
  const last = [...calls]
    .reverse()
    .find(([channel]) => channel === ipcChannels.window.miniPlayerStateChanged)
  return last?.[1]?.mode
}

describe('MiniPlayerWindowController', () => {
  it('shrinks a normal window and reports mini only after bounds apply', async () => {
    const window = new FakeMiniPlayerWindow()
    const controller = createController(window)

    const state = await controller.enter()

    expect(state.mode).toBe('mini')
    expect(window.getBounds()).toMatchObject({
      width: MINI_BODY.width,
      height: MINI_BODY.height,
    })
    expect(isMiniSizeLocked(window)).toBe(true)
    expect(window.alwaysOnTop).toBe(true)
    expect(window.fullscreenable).toBe(false)
    expect(window.hideCount).toBe(0)
  })

  it('attaches leave-full-screen before setFullScreen(false) when occupying but not fullscreen', async () => {
    const window = new FakeMiniPlayerWindow({
      exclusive: true,
      fullScreen: false,
      leaveFullScreen: 'never',
      restoreExclusiveOnShow: true,
    })
    const order: string[] = []
    window.on('newListener', (eventName: string | symbol) => {
      if (eventName === 'leave-full-screen') {
        order.push('listen')
      }
    })
    const originalSetFullScreen = window.setFullScreen.bind(window)
    window.setFullScreen = (value: boolean): void => {
      if (!value) {
        order.push('setFullScreen(false)')
      }
      originalSetFullScreen(value)
    }

    const state = await createController(window).enter()

    expect(order[0]).toBe('listen')
    expect(order.indexOf('listen')).toBeLessThan(order.indexOf('setFullScreen(false)'))
    expect(window.setFullScreenCalls).toContain(false)
    expect(state.mode).toBe('normal')
    expect(isMiniSizeLocked(window)).toBe(false)
    expect(window.alwaysOnTop).toBe(false)
  })

  it('does not treat a leave-full-screen timeout as success while bounds still occupy the display', async () => {
    const window = new FakeMiniPlayerWindow({
      exclusive: true,
      fullScreen: true,
      leaveFullScreen: 'never',
      restoreExclusiveOnShow: true,
    })

    const state = await createController(window).enter()

    expect(window.setFullScreenCalls).toContain(false)
    expect(state.mode).toBe('normal')
    expect(lastEmittedMode(window)).toBe('normal')
    expect(isMiniSizeLocked(window)).toBe(false)
    expect(window.resizable).toBe(true)
    expect(window.minSize).toEqual([900, 620])
    expect(window.isFullScreen()).toBe(true)
    expect(window.getBounds()).toEqual(DISPLAY.bounds)
  })

  it('does not report mini when maximize is still active and setBounds is ignored', async () => {
    const window = new FakeMiniPlayerWindow({
      maximized: true,
      unmaximize: 'never',
    })

    const state = await createController(window).enter()

    expect(window.isMaximized()).toBe(true)
    expect(window.setBoundsCalls.length).toBeGreaterThan(0)
    expect(window.getBounds()).toEqual(DISPLAY.workArea)
    expect(state.mode).toBe('normal')
    expect(isMiniSizeLocked(window)).toBe(false)
    expect(window.maximized).toBe(true)
  })

  it('unmaximizes before shrinking a maximized window', async () => {
    const window = new FakeMiniPlayerWindow({
      maximized: true,
      unmaximize: 'emit',
    })

    const state = await createController(window).enter()

    expect(state.mode).toBe('mini')
    expect(window.isMaximized()).toBe(false)
    expect(window.getBounds()).toMatchObject({
      width: MINI_BODY.width,
      height: MINI_BODY.height,
    })
  })

  it('retries with hide/show and reports mini only after getBounds matches', async () => {
    const window = new FakeMiniPlayerWindow({
      exclusive: true,
      fullScreen: true,
      leaveFullScreen: 'never',
      restoreExclusiveOnShow: false,
    })

    const state = await createController(window).enter()

    expect(window.hideCount).toBeGreaterThan(0)
    expect(window.showCount).toBeGreaterThan(0)
    expect(state.mode).toBe('mini')
    expect(window.getBounds()).toMatchObject({
      width: MINI_BODY.width,
      height: MINI_BODY.height,
    })
    expect(isMiniSizeLocked(window)).toBe(true)
  })

  it('restores the previous window and does not lock min=max when geometry never applies', async () => {
    const window = new FakeMiniPlayerWindow({
      exclusive: true,
      fullScreen: true,
      leaveFullScreen: 'never',
      restoreExclusiveOnShow: true,
    })

    const state = await createController(window).enter()

    expect(state.mode).toBe('normal')
    expect(lastEmittedMode(window)).toBe('normal')
    expect(isMiniSizeLocked(window)).toBe(false)
    expect(window.alwaysOnTop).toBe(false)
    expect(window.fullscreenable).toBe(true)
    expect(window.resizable).toBe(true)
    expect(window.isFullScreen()).toBe(true)
  })

  it('retries geometry when already committed but the window is still large', async () => {
    const window = new FakeMiniPlayerWindow()
    const controller = createController(window)

    expect((await controller.enter()).mode).toBe('mini')
    const callsAfterFirst = window.setBoundsCalls.length

    window.forceBounds({ x: 10, y: 10, width: 1180, height: 760 })
    const retried = await controller.enter()

    expect(retried.mode).toBe('mini')
    expect(window.setBoundsCalls.length).toBeGreaterThan(callsAfterFirst)
    expect(window.getBounds()).toMatchObject({
      width: MINI_BODY.width,
      height: MINI_BODY.height,
    })
  })

  it('does not recapture or reapply when mini bounds are already in place', async () => {
    const window = new FakeMiniPlayerWindow()
    const controller = createController(window)

    await controller.enter()
    const callsAfterFirst = window.setBoundsCalls.length
    const second = await controller.enter()

    expect(second.mode).toBe('mini')
    expect(window.setBoundsCalls.length).toBe(callsAfterFirst)
  })

  it('intercepts F11 after a successful enter and restores without the guard blocking fullscreen', async () => {
    const window = new FakeMiniPlayerWindow()
    const controller = createController(window)
    await controller.enter()

    const preventDefault = vi.fn()
    window.webContents.beforeInput?.(
      { preventDefault } as unknown as Electron.Event,
      { type: 'keyDown', key: 'F11' } as Electron.Input,
    )
    expect(preventDefault).toHaveBeenCalledOnce()

    const restored = await controller.restore()
    expect(restored.mode).toBe('normal')
    expect(window.getBounds()).toEqual(NORMAL_BOUNDS)

    preventDefault.mockClear()
    window.webContents.beforeInput?.(
      { preventDefault } as unknown as Electron.Event,
      { type: 'keyDown', key: 'F11' } as Electron.Input,
    )
    expect(preventDefault).not.toHaveBeenCalled()
  })
})
