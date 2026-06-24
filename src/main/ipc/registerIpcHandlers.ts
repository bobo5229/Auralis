import { app, BrowserWindow, ipcMain } from 'electron'
import { ipcChannels } from '@shared/ipc/channels'
import { getDatabasePath } from '@main/database/connection'
import { LibraryRepository } from '@main/repositories/libraryRepository'
import { TrackRepository } from '@main/repositories/trackRepository'
import { MetadataRefreshRepository } from '@main/repositories/metadataRefreshRepository'
import { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import { LibraryScanService } from '@main/features/libraryScan/libraryScanService'
import { LibraryService } from '@main/services/libraryService'
import { MetadataRefreshService } from '@main/features/metadata/metadataRefreshService'
import { MetadataWatchService } from '@main/features/metadata/metadataWatchService'
import { LibraryIncrementalImportService } from '@main/features/libraryScan/libraryIncrementalImportService'
import type { IpcResponse } from '@shared/ipc/contracts'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import type Database from 'better-sqlite3'

export function registerIpcHandlers(db: Database.Database, artworkCacheDir: string): void {
  const libraryService = new LibraryService(new LibraryRepository(db), new TrackRepository(db))
  const libraryScanService = new LibraryScanService(db, artworkCacheDir)
  const trackRepository = new TrackRepository(db)
  const metadataRefreshService = new MetadataRefreshService(
    new MetadataRefreshRepository(db),
    artworkCacheDir,
    (channel, data) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(channel, data)
      }
    },
  )
  const incrementalImportService = new LibraryIncrementalImportService(
    trackRepository,
    artworkCacheDir,
    (channel, data) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(channel, data)
      }
    },
  )
  const metadataWatchService = new MetadataWatchService(
    new LibraryRootRepository(db),
    trackRepository,
    metadataRefreshService,
    incrementalImportService,
  )

  metadataWatchService.start()
  app.on('before-quit', () => {
    metadataWatchService.stop()
  })

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
    async (): Promise<IpcResponse<'library:select-root'>> => {
      const result = await libraryScanService.selectRoot()
      metadataWatchService.syncRoots()
      return result
    },
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

  ipcMain.handle(
    ipcChannels.lyrics.getByTrackId,
    (_event, payload: { trackId: number }): IpcResponse<'lyrics:get-by-track-id'> =>
      libraryService.getLyrics(payload.trackId),
  )

  ipcMain.handle(
    ipcChannels.metadata.refreshTrack,
    (_event, payload: { trackId: number }): IpcResponse<'metadata:refresh-track'> =>
      metadataRefreshService.refreshTrack(payload.trackId),
  )

  ipcMain.handle(
    ipcChannels.metadata.refreshTracks,
    (_event, payload: { trackIds: number[] }): IpcResponse<'metadata:refresh-tracks'> =>
      metadataRefreshService.refreshTracks(payload.trackIds),
  )

  ipcMain.handle(
    ipcChannels.metadata.refreshMissing,
    (_event, payload?: { limit?: number }): IpcResponse<'metadata:refresh-missing'> =>
      metadataRefreshService.refreshMissingMetadata(payload?.limit),
  )

  ipcMain.handle(
    ipcChannels.metadata.refreshLyricsMissing,
    (_event, payload?: { limit?: number }): IpcResponse<'metadata:refresh-lyrics-missing'> =>
      metadataRefreshService.refreshLyricsForMissing(payload?.limit),
  )

  ipcMain.handle(
    ipcChannels.metadata.getRefreshStatus,
    (_event, payload: { jobId: number }): IpcResponse<'metadata:get-refresh-status'> =>
      metadataRefreshService.getJobStatus(payload.jobId),
  )

  ipcMain.handle(
    ipcChannels.metadata.listRefreshFailures,
    (_event, payload?: { limit?: number }): IpcResponse<'metadata:list-refresh-failures'> =>
      metadataRefreshService.listFailures(payload?.limit),
  )

  ipcMain.handle(
    ipcChannels.metadata.getTrackMetadata,
    (_event, payload: { trackId: number }): IpcResponse<'metadata:get-track-metadata'> =>
      metadataRefreshService.getTrackMetadata(payload.trackId),
  )

  ipcMain.handle(
    ipcChannels.metadata.updateTrackMetadata,
    (_event, payload: EditableTrackMetadata): IpcResponse<'metadata:update-track-metadata'> =>
      metadataRefreshService.updateTrackMetadata(payload),
  )
}
