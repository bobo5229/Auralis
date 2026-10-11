import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSystemTray } from './systemTray'
import { setNativeUiLocale } from './uiLocale'

const mock = vi.hoisted(() => ({ create: vi.fn(), menu: vi.fn((items: unknown[]) => items) }))
vi.mock('./appIcon', () => ({ resolveAppIconPath: () => 'icon.png' }))
vi.mock('electron', () => ({
  Tray: class {
    constructor() {
      return mock.create()
    }
  },
  Menu: { buildFromTemplate: mock.menu },
  nativeImage: { createFromPath: () => ({ isEmpty: () => false, resize: () => 'icon' }) },
}))

function harness() {
  let destroyed = false
  const tray = Object.assign(new EventEmitter(), {
    isDestroyed: () => destroyed,
    destroy: vi.fn(() => {
      destroyed = true
    }),
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
  })
  mock.create.mockReturnValue(tray)
  const restoreWindow = vi.fn(),
    quit = vi.fn(),
    reportError = vi.fn()
  return { tray, restoreWindow, quit, reportError }
}
beforeEach(() => {
  mock.create.mockReset()
  mock.menu.mockClear()
  setNativeUiLocale('zh-Hans')
})

describe('system tray lifecycle', () => {
  it('restores the existing window, provides explicit quit and updates the menu language', () => {
    const h = harness()
    const controller = createSystemTray(h)
    expect(controller.isAvailable()).toBe(true)
    h.tray.emit('click')
    expect(h.restoreWindow).toHaveBeenCalledOnce()
    let menu = mock.menu.mock.calls.at(-1)![0] as { label?: string; click?: () => void }[]
    expect(menu.map((item) => item.label).filter(Boolean)).toEqual(['显示主界面', '退出应用'])
    menu[2].click?.()
    expect(h.quit).toHaveBeenCalledOnce()
    setNativeUiLocale('en')
    menu = mock.menu.mock.calls.at(-1)![0] as { label?: string }[]
    expect(menu.map((item) => item.label).filter(Boolean)).toEqual([
      'Show main window',
      'Quit Auralis',
    ])
    controller.dispose()
    const calls = mock.menu.mock.calls.length
    setNativeUiLocale('zh-Hans')
    expect(mock.menu).toHaveBeenCalledTimes(calls)
    expect(h.tray.destroy).toHaveBeenCalledOnce()
    expect(h.tray.listenerCount('click')).toBe(0)
    expect(controller.isAvailable()).toBe(false)
  })

  it('cleans up a tray whose menu preparation fails', () => {
    const h = harness()
    h.tray.setContextMenu.mockImplementation(() => {
      throw new Error('shell unavailable')
    })
    const controller = createSystemTray(h)
    expect(controller.isAvailable()).toBe(false)
    expect(h.reportError).toHaveBeenCalledOnce()
    expect(h.tray.destroy).toHaveBeenCalledOnce()
    expect(h.tray.listenerCount('click')).toBe(0)
    controller.dispose()
  })
})
