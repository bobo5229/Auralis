import { ipcChannels } from '@shared/ipc/channels'
import type { IpcResponse } from '@shared/ipc/contracts'
import type { IpcHandlerRegistrar } from './ipcHandlerRegistrar'

export interface AppIpcDependencies {
  getInfo(): IpcResponse<'app:get-info'>
  exportDiagnostics(
    event: Electron.IpcMainInvokeEvent,
  ): Promise<IpcResponse<'app:export-diagnostics'>>
}

export function registerAppIpcHandlers(
  registrar: IpcHandlerRegistrar,
  dependencies: AppIpcDependencies,
): void {
  registrar.handle(ipcChannels.app.getInfo, () => dependencies.getInfo())
  registrar.handle(ipcChannels.app.exportDiagnostics, (event) =>
    dependencies.exportDiagnostics(event),
  )
}
