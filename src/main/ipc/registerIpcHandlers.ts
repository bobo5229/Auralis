import { app, ipcMain } from 'electron'
import { ipcChannels } from '@shared/ipc/channels'
import { getDatabasePath } from '@main/database/connection'
import { LibraryRepository } from '@main/repositories/libraryRepository'
import { TrackRepository } from '@main/repositories/trackRepository'
import { LibraryScanService } from '@main/features/libraryScan/libraryScanService'
import { LibraryService } from '@main/services/libraryService'
import type { IpcResponse } from '@shared/ipc/contracts'
import type Database from 'better-sqlite3'

export function registerIpcHandlers(db: Database.Database, artworkCacheDir: string): void {
  const libraryService = new LibraryService(new LibraryRepository(db), new TrackRepository(db))
  const libraryScanService = new LibraryScanService(db, artworkCacheDir)

  ipcMain.handle(
    ipcChannels.app.getInfo,
    (): IpcResponse<'app:get-info'> => ({
      name: 'Auralis',
      version: app.getVersion(),
      databasePath: getDatabasePath(),
    }),
  )

  ipcMain.handle(
    ipcChannels.library.getStats,
    (): IpcResponse<'library:get-stats'> => libraryService.getStats(),
  )

  ipcMain.handle(
    ipcChannels.library.selectRoot,
    (): Promise<IpcResponse<'library:select-root'>> => libraryScanService.selectRoot(),
  )

  ipcMain.handle(
    ipcChannels.library.getRoots,
    (): IpcResponse<'library:get-roots'> => libraryScanService.getRoots(),
  )

  ipcMain.handle(
    ipcChannels.library.startScan,
    (_event, payload: { rootId: number }): IpcResponse<'library:start-scan'> =>
      libraryScanService.startScan(payload.rootId),
  )

  ipcMain.handle(
    ipcChannels.library.cancelScan,
    (_event, payload: { jobId: number }): Promise<IpcResponse<'library:cancel-scan'>> =>
      libraryScanService.cancelScan(payload.jobId),
  )

  ipcMain.handle(
    ipcChannels.library.getScanStatus,
    (_event, payload?: { jobId?: number }): IpcResponse<'library:get-scan-status'> =>
      libraryScanService.getScanStatus(payload?.jobId),
  )

  ipcMain.handle(
    ipcChannels.library.getTracks,
    (): IpcResponse<'library:get-tracks'> => libraryService.getTracks(),
  )
}
