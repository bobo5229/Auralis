import { ipcChannels } from '@shared/ipc/channels'
import type { IpcResponse } from '@shared/ipc/contracts'
import type { IpcHandlerRegistrar } from './ipcHandlerRegistrar'

export interface DatabaseIpcDependencies {
  exportBackup(event: Electron.IpcMainInvokeEvent): Promise<IpcResponse<'database:export-backup'>>
  restoreBackup(event: Electron.IpcMainInvokeEvent): Promise<IpcResponse<'database:restore-backup'>>
}

export function registerDatabaseIpcHandlers(
  registrar: IpcHandlerRegistrar,
  dependencies: DatabaseIpcDependencies,
): void {
  registrar.handle(ipcChannels.database.exportBackup, (event) => dependencies.exportBackup(event))
  registrar.handle(ipcChannels.database.restoreBackup, (event) => dependencies.restoreBackup(event))
}
