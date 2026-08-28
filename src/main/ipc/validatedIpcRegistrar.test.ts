import { describe, expect, it, vi } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'
import {
  createTrustedMainWindowSourcePolicy,
  createValidatedIpcRegistrar,
  IpcInvokeSourceError,
} from './validatedIpcRegistrar'

interface FakeSender {
  destroyed: boolean
  mainFrame: object
  url: string
  getURL(): string
  isDestroyed(): boolean
}

function createSender(): FakeSender {
  const sender: FakeSender = {
    destroyed: false,
    mainFrame: {},
    url: 'file:///D:/Auralis/out/renderer/index.html#/library',
    getURL: () => sender.url,
    isDestroyed: () => sender.destroyed,
  }
  return sender
}

function createEvent(sender = createSender()): IpcMainInvokeEvent {
  return {
    sender,
    senderFrame: sender.mainFrame,
  } as unknown as IpcMainInvokeEvent
}

describe('validated IPC registrar', () => {
  it('checks sender and payload before invoking the domain listener', () => {
    let rawListener: ((event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) | undefined
    const domainListener = vi.fn(() => ({ jobId: 7 }))
    const registrar = createValidatedIpcRegistrar({
      register: (_channel, listener) => {
        rawListener = listener
      },
      isTrustedSender: () => true,
    })

    registrar.handle('library:start-scan', domainListener)
    const event = createEvent()

    expect(rawListener?.(event, { rootId: 2 })).toEqual({ jobId: 7 })
    expect(domainListener).toHaveBeenCalledWith(event, { rootId: 2 })
    expect(() => rawListener?.(event, { rootId: -1 })).toThrow(/positive|minimum/)
    expect(domainListener).toHaveBeenCalledTimes(1)
  })

  it('rejects an untrusted sender before parsing or invoking the listener', () => {
    let rawListener: ((event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) | undefined
    const domainListener = vi.fn()
    const registrar = createValidatedIpcRegistrar({
      register: (_channel, listener) => {
        rawListener = listener
      },
      isTrustedSender: () => false,
    })

    registrar.handle('library:start-scan', domainListener)

    expect(() => rawListener?.(createEvent(), { rootId: 1 })).toThrow(IpcInvokeSourceError)
    expect(domainListener).not.toHaveBeenCalled()
  })
})

describe('trusted main-window IPC source policy', () => {
  it('accepts only a live allowed top-frame sender at the trusted renderer entry', () => {
    const sender = createSender()
    const electronSender = sender as unknown as IpcMainInvokeEvent['sender']
    const window = {
      webContents: sender,
      allowed: true,
    }
    const policy = createTrustedMainWindowSourcePolicy({
      fromWebContents: (candidate) => (candidate === electronSender ? window : null),
      isAllowedWindow: (candidate) => candidate === window && window.allowed,
      isTrustedRendererUrl: (url) => url.startsWith('file:///D:/Auralis/out/renderer/index.html'),
    })

    expect(policy(createEvent(sender))).toBe(true)

    const childFrameEvent = createEvent(sender)
    Object.assign(childFrameEvent, { senderFrame: {} })
    expect(policy(childFrameEvent)).toBe(false)

    sender.destroyed = true
    expect(policy(createEvent(sender))).toBe(false)
    sender.destroyed = false

    sender.url = 'https://attacker.example/'
    expect(policy(createEvent(sender))).toBe(false)
    sender.url = 'file:///D:/Auralis/out/renderer/index.html#/library'

    window.allowed = false
    expect(policy(createEvent(sender))).toBe(false)
  })

  it('rejects detached and mismatched BrowserWindow ownership', () => {
    const sender = createSender()
    const otherSender = createSender()
    const detachedPolicy = createTrustedMainWindowSourcePolicy({
      fromWebContents: () => null,
      isAllowedWindow: () => true,
      isTrustedRendererUrl: () => true,
    })
    const mismatchedPolicy = createTrustedMainWindowSourcePolicy({
      fromWebContents: () => ({ webContents: otherSender }),
      isAllowedWindow: () => true,
      isTrustedRendererUrl: () => true,
    })

    expect(detachedPolicy(createEvent(sender))).toBe(false)
    expect(mismatchedPolicy(createEvent(sender))).toBe(false)
  })
})
