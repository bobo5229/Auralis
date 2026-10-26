import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { createWindowBehaviorController } from './windowBehaviorController'
import { createAppShutdownHandler } from './appShutdown'
import type { WindowCloseBehavior } from '@shared/types/windowBehavior'

function harness(initial: WindowCloseBehavior = 'quit', available = true) {
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    hide: vi.fn(),
    minimize: vi.fn(),
  })
  let behavior = initial
  const preference = {
    get: () => behavior,
    set: vi.fn((value: WindowCloseBehavior) => {
      behavior = value
    }),
  }
  const quit = vi.fn()
  const trayAvailable = vi.fn(() => available)
  const controller = createWindowBehaviorController({ preference, trayAvailable, quit })
  controller.attachWindow(window as unknown as Parameters<typeof controller.attachWindow>[0])
  return { controller, window, quit, preference, trayAvailable }
}

describe('window close behavior', () => {
  it.each(['quit', 'tray'] as const)('handles %s without destroying the window', (behavior) => {
    const { controller, window, quit } = harness(behavior)
    const event = { preventDefault: vi.fn() }
    window.emit('close', event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(quit).toHaveBeenCalledTimes(behavior === 'quit' ? 1 : 0)
    expect(window.hide).toHaveBeenCalledTimes(behavior === 'tray' ? 1 : 0)
    expect(window.minimize).not.toHaveBeenCalled()
    controller.dispose()
    expect(window.listenerCount('close')).toBe(0)
  })

  it('keeps the window accessible for an unavailable saved tray mode and rejects selecting it', () => {
    const { controller, window, preference } = harness('tray', false)
    window.emit('close', { preventDefault: vi.fn() })
    expect(window.hide).not.toHaveBeenCalled()
    expect(window.minimize).not.toHaveBeenCalled()
    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
    expect(() => controller.setBehavior('tray')).toThrow('unavailable')
    expect(preference.set).not.toHaveBeenCalled()
    expect(controller.setBehavior('quit')).toEqual({
      behavior: 'quit',
      trayAvailable: false,
    })
  })

  it('restores and focuses the same minimized window, attaches once and detaches when destroyed', () => {
    const { controller, window } = harness('tray')
    controller.attachWindow(window as unknown as Parameters<typeof controller.attachWindow>[0])
    expect(window.listenerCount('close')).toBe(1)
    window.isMinimized.mockReturnValue(true)
    expect(controller.restoreWindow()).toBe(true)
    expect(window.restore.mock.invocationCallOrder[0]).toBeLessThan(
      window.show.mock.invocationCallOrder[0],
    )
    expect(window.focus).toHaveBeenCalledOnce()
    window.isDestroyed.mockReturnValue(true)
    window.emit('closed')
    expect(controller.restoreWindow()).toBe(false)
    expect(window.listenerCount('close')).toBe(0)
  })

  it('lets an explicit app or OS shutdown close a tray-mode window', () => {
    const { controller, window } = harness('tray')
    controller.beginQuit()
    const pendingClose = { preventDefault: vi.fn() }
    window.emit('close', pendingClose)
    expect(pendingClose.preventDefault).toHaveBeenCalledOnce()
    controller.allowWindowClose()
    const event = { preventDefault: vi.fn() }
    window.emit('close', event)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(window.hide).not.toHaveBeenCalled()
    expect(() => controller.setBehavior('quit')).toThrow('shutting down')
  })

  it('does not intercept Windows session shutdown', () => {
    const { window } = harness('tray')
    window.emit('query-session-end')
    const event = { preventDefault: vi.fn() }
    window.emit('close', event)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('drains once, restores after failure and permits retrying explicit exit', async () => {
    const { controller, quit, window } = harness('tray')
    const shutdown = vi.fn().mockRejectedValueOnce(new Error('busy')).mockResolvedValue(undefined)
    const finalQuit = vi.fn()
    const handler = createAppShutdownHandler({
      shutdownServices: shutdown,
      closeResources: vi.fn(),
      quit: finalQuit,
      reportError: () => controller.shutdownFailed(),
    })
    quit.mockImplementation(() => {
      controller.beginQuit()
      handler({ preventDefault: vi.fn() })
    })
    controller.requestQuit()
    controller.requestQuit()
    expect(quit).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(window.show).toHaveBeenCalledOnce())
    controller.requestQuit()
    await vi.waitFor(() => expect(finalQuit).toHaveBeenCalledOnce())
    expect(shutdown).toHaveBeenCalledTimes(2)
  })
})
