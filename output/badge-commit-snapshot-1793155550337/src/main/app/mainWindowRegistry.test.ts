import { EventEmitter } from 'node:events'
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { describe, expect, it } from 'vitest'
import { createTrustedMainWindowSourcePolicy } from '@main/ipc/validatedIpcRegistrar'
import { isRegisteredMainWindow, registerMainWindow } from './mainWindowRegistry'

function createWindow() {
  let destroyed = false
  const emitter = new EventEmitter()
  const sender = {
    mainFrame: {},
    isDestroyed: () => destroyed,
    getURL: () => 'file:///auralis/index.html',
  }
  const window = Object.assign(emitter, {
    isDestroyed: () => destroyed,
    webContents: sender,
  }) as unknown as BrowserWindow
  return {
    window,
    emitter,
    sender,
    destroy: () => {
      destroyed = true
    },
  }
}

describe('main window registration', () => {
  it('grants IPC identity only while the registered window is live', () => {
    const { window, emitter, sender, destroy } = createWindow()
    const policy = createTrustedMainWindowSourcePolicy({
      fromWebContents: () => window,
      isAllowedWindow: (candidate) => isRegisteredMainWindow(candidate as BrowserWindow),
      isTrustedRendererUrl: (url) => url === 'file:///auralis/index.html',
    })
    const event = { sender, senderFrame: sender.mainFrame } as unknown as IpcMainInvokeEvent
    expect(policy(event)).toBe(false)
    registerMainWindow(window)
    registerMainWindow(window)
    expect(emitter.listenerCount('closed')).toBe(1)
    expect(policy(event)).toBe(true)
    emitter.emit('closed')
    expect(isRegisteredMainWindow(window)).toBe(false)
    expect(policy(event)).toBe(false)
    destroy()
    registerMainWindow(window)
    expect(isRegisteredMainWindow(window)).toBe(false)
  })

  it('rejects destroyed windows before the closed callback and does not grant identity to peers', () => {
    const first = createWindow()
    const second = createWindow()
    registerMainWindow(first.window)
    expect(isRegisteredMainWindow(second.window)).toBe(false)
    first.destroy()
    expect(isRegisteredMainWindow(first.window)).toBe(false)
    registerMainWindow(second.window)
    first.emitter.emit('closed')
    expect(isRegisteredMainWindow(second.window)).toBe(true)
    second.emitter.emit('closed')
    expect(isRegisteredMainWindow(second.window)).toBe(false)
  })
})
