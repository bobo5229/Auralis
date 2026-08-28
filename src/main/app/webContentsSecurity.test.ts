import type { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { isTrustedRendererUrl, secureRendererWindow } from './webContentsSecurity'

describe('isTrustedRendererUrl', () => {
  it('allows hash routes and the desktop lyrics query on the configured dev entry', () => {
    const entry = 'http://127.0.0.1:5173/'

    expect(isTrustedRendererUrl('http://127.0.0.1:5173/#/library', entry)).toBe(true)
    expect(isTrustedRendererUrl('http://127.0.0.1:5173/?desktopLyrics=1', entry)).toBe(true)
  })

  it('rejects a different origin, credentials, or renderer path', () => {
    const entry = 'http://localhost:5173/app/'

    expect(isTrustedRendererUrl('https://localhost:5173/app/', entry)).toBe(false)
    expect(isTrustedRendererUrl('http://attacker.test:5173/app/', entry)).toBe(false)
    expect(isTrustedRendererUrl('http://user@localhost:5173/app/', entry)).toBe(false)
    expect(isTrustedRendererUrl('http://localhost:5173/other/', entry)).toBe(false)
  })

  it('allows only the configured production renderer file', () => {
    const entry = 'D:\\Auralis\\out\\renderer\\index.html'

    expect(
      isTrustedRendererUrl('file:///D:/Auralis/out/renderer/index.html?desktopLyrics=1', entry),
    ).toBe(true)
    expect(isTrustedRendererUrl('file:///D:/Auralis/out/renderer/other.html', entry)).toBe(false)
    expect(isTrustedRendererUrl('https://example.com/index.html', entry)).toBe(false)
  })

  it('rejects malformed URLs', () => {
    expect(isTrustedRendererUrl('http://[invalid', 'http://localhost:5173/')).toBe(false)
    expect(isTrustedRendererUrl('http://localhost:5173/%invalid', 'http://localhost:5173/')).toBe(
      false,
    )
  })
})

describe('secureRendererWindow', () => {
  it('denies capabilities and blocks untrusted renderer transitions', () => {
    type Listener = (...args: unknown[]) => void
    const listeners = new Map<string, Listener>()
    let openHandler: (() => { action: string }) | undefined
    const session = {
      setPermissionCheckHandler: vi.fn(),
      setPermissionRequestHandler: vi.fn(),
    }
    const webContents = {
      session,
      setWindowOpenHandler: vi.fn((handler: () => { action: string }) => {
        openHandler = handler
      }),
      on: vi.fn((event: string, listener: Listener) => {
        listeners.set(event, listener)
      }),
    }

    secureRendererWindow({ webContents } as unknown as BrowserWindow, 'http://localhost:5173/')

    expect(session.setPermissionCheckHandler).toHaveBeenCalledOnce()
    expect(session.setPermissionRequestHandler).toHaveBeenCalledOnce()
    expect(openHandler?.()).toEqual({ action: 'deny' })

    const trustedEvent = { preventDefault: vi.fn() }
    listeners.get('will-navigate')?.(trustedEvent, 'http://localhost:5173/#/albums')
    expect(trustedEvent.preventDefault).not.toHaveBeenCalled()

    const untrustedEvent = { preventDefault: vi.fn() }
    listeners.get('will-redirect')?.(untrustedEvent, 'https://attacker.test/')
    expect(untrustedEvent.preventDefault).toHaveBeenCalledOnce()

    const webviewEvent = { preventDefault: vi.fn() }
    listeners.get('will-attach-webview')?.(webviewEvent)
    expect(webviewEvent.preventDefault).toHaveBeenCalledOnce()
  })
})
