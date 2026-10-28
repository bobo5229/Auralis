import type { WebContents } from 'electron'
import type { IpcEventChannel, IpcEventPayload } from '@shared/ipc/contracts'
import { logger } from '@main/logging/logger'

type EventTarget = Pick<WebContents, 'isDestroyed' | 'send'>

export type RendererEventSender = <C extends IpcEventChannel>(
  channel: C,
  payload: IpcEventPayload<C>,
) => void

export function sendRendererEvent<C extends IpcEventChannel>(
  target: EventTarget,
  channel: C,
  payload: IpcEventPayload<C>,
): void {
  if (!target.isDestroyed()) target.send(channel, payload)
}

export function createRendererEventSender(
  getWindows: () => ReadonlyArray<{ webContents: EventTarget }>,
): RendererEventSender {
  return (channel, payload) => {
    for (const window of getWindows()) {
      try {
        sendRendererEvent(window.webContents, channel, payload)
      } catch (error) {
        logger.warn({ error, channel }, 'Failed to send renderer event')
      }
    }
  }
}
