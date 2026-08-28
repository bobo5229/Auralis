import type { IpcMainInvokeEvent } from 'electron'
import type { IpcHandlerRegistrar } from './ipcHandlerRegistrar'
import { parseDomainIpcPayload, type DomainIpcInvokeChannel } from './ipcPayloadValidation'

type RawInvokeListener = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown

export interface ValidatedIpcRegistrarOptions {
  register(channel: string, listener: RawInvokeListener): void
  isTrustedSender(event: IpcMainInvokeEvent): boolean
}

export class IpcInvokeSourceError extends Error {
  constructor(channel: string) {
    super(`IPC invoke rejected for "${channel}": untrusted sender`)
    this.name = 'IpcInvokeSourceError'
  }
}

export function createValidatedIpcRegistrar(
  options: ValidatedIpcRegistrarOptions,
): IpcHandlerRegistrar {
  return {
    handle(channel, listener) {
      options.register(channel, (event, ...args) => {
        if (!options.isTrustedSender(event)) {
          throw new IpcInvokeSourceError(channel)
        }

        const payload = parseDomainIpcPayload(channel as DomainIpcInvokeChannel, args)
        return listener(event, payload as never)
      })
    },
  }
}

interface TrustedSenderWindow {
  webContents: {
    isDestroyed(): boolean
  }
}

interface TrustedSenderWebContents {
  getURL(): string
  isDestroyed(): boolean
  mainFrame: unknown
}

export interface TrustedMainWindowSourceOptions {
  fromWebContents(sender: IpcMainInvokeEvent['sender']): TrustedSenderWindow | null
  isAllowedWindow(window: TrustedSenderWindow): boolean
  isTrustedRendererUrl(url: string): boolean
}

/**
 * Trust only top-frame invokes from a live BrowserWindow that the composition root
 * recognizes as an Auralis main/miniplayer window and whose current URL is the
 * configured renderer entry. The injected boundaries keep this policy unit-testable.
 */
export function createTrustedMainWindowSourcePolicy(
  options: TrustedMainWindowSourceOptions,
): (event: IpcMainInvokeEvent) => boolean {
  return (event) => {
    try {
      const sender = event.sender as unknown as TrustedSenderWebContents
      if (!sender || sender.isDestroyed()) return false
      if (!event.senderFrame || event.senderFrame !== sender.mainFrame) return false

      const window = options.fromWebContents(event.sender)
      if (!window || window.webContents !== event.sender || window.webContents.isDestroyed()) {
        return false
      }
      if (!options.isAllowedWindow(window)) return false

      return options.isTrustedRendererUrl(sender.getURL())
    } catch {
      return false
    }
  }
}
