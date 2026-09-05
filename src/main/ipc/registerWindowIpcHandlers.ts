import type { IpcMainInvokeEvent } from 'electron'
import { ipcChannels } from '@shared/ipc/channels'
import type { MiniPlayerWindowController } from '@main/app/miniPlayerWindowController'
import type { IpcHandlerRegistrar } from './ipcHandlerRegistrar'

type MiniPlayerControls = Pick<
  MiniPlayerWindowController,
  'enter' | 'restore' | 'getState' | 'setPopover'
>

export interface WindowIpcDependencies {
  getMiniPlayerController(event: IpcMainInvokeEvent): MiniPlayerControls
}

export function registerWindowIpcHandlers(
  registrar: IpcHandlerRegistrar,
  dependencies: WindowIpcDependencies,
): void {
  const { getMiniPlayerController } = dependencies

  registrar.handle(ipcChannels.window.enterMiniPlayer, (event) =>
    getMiniPlayerController(event).enter(),
  )
  registrar.handle(ipcChannels.window.restoreFromMiniPlayer, (event) =>
    getMiniPlayerController(event).restore(),
  )
  registrar.handle(ipcChannels.window.getMiniPlayerState, (event) =>
    getMiniPlayerController(event).getState(),
  )
  registrar.handle(
    ipcChannels.window.setMiniPlayerPopover,
    (event, payload: { open: boolean; direction: 'above' | 'below'; height: number }) =>
      getMiniPlayerController(event).setPopover(payload.open, payload.direction, payload.height),
  )
}
