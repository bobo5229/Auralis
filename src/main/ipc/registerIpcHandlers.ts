import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { ipcChannels } from '@shared/ipc/channels'
import { getMiniPlayerWindowController } from '@main/app/miniPlayerWindowController'
import { isTrustedRendererUrl } from '@main/app/webContentsSecurity'
import { getDatabasePath } from '@main/database/connection'
import { exportDatabaseBackup, stageDatabaseRestore } from '@main/database/databaseBackupService'
import { ArtworkCacheGarbageCollector } from '@main/features/artwork/artworkCacheGarbageCollector'
import { ArtworkCacheMaintenanceService } from '@main/features/artwork/artworkCacheMaintenanceService'
import { ArtworkCacheMigrationService } from '@main/features/artwork/artworkCacheMigrationService'
import { isPathUnderAnyRoot } from '@main/features/audio/audioPathGuard'
import { buildAudioTrackUrl, isPlayableAudioExtension } from '@main/features/audio/audioProtocol'
import { LibraryIncrementalImportService } from '@main/features/libraryScan/libraryIncrementalImportService'
import { LibraryScanService } from '@main/features/libraryScan/libraryScanService'
import { MetadataRefreshService } from '@main/features/metadata/metadataRefreshService'
import { MetadataWatchService } from '@main/features/metadata/metadataWatchService'
import { logger } from '@main/logging/logger'
import { exportDiagnostics } from '@main/logging/diagnosticExport'
import { LibraryRepository } from '@main/repositories/libraryRepository'
import { LibraryRootRepository } from '@main/repositories/libraryRootRepository'
import { MetadataRefreshRepository } from '@main/repositories/metadataRefreshRepository'
import { PlaylistRepository } from '@main/repositories/playlistRepository'
import { PlayStatsRepository } from '@main/repositories/playStatsRepository'
import { SmartPlaylistRepository } from '@main/repositories/smartPlaylistRepository'
import { TrackRepository } from '@main/repositories/trackRepository'
import { LibraryService } from '@main/services/libraryService'
import { PlaylistService } from '@main/services/playlistService'
import { PlayStatsService } from '@main/services/playStatsService'
import { SmartPlaylistService } from '@main/services/smartPlaylistService'
import type Database from 'better-sqlite3'
import { registerDomainIpcHandlers } from './registerDomainIpcHandlers'
import {
  createTrustedMainWindowSourcePolicy,
  createValidatedIpcRegistrar,
} from './validatedIpcRegistrar'

function getInvokingMiniPlayerController(event: Electron.IpcMainInvokeEvent) {
  const window = BrowserWindow.fromWebContents(event.sender)
  const controller = window ? getMiniPlayerWindowController(window) : undefined
  if (!controller) {
    throw new Error('Mini player controls are only available in the main window.')
  }
  return controller
}

function isMissingFileError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

export function registerIpcHandlers(db: Database.Database, artworkCacheDir: string): void {
  const libraryService = new LibraryService(new LibraryRepository(db), new TrackRepository(db))
  const libraryScanService = new LibraryScanService(db, artworkCacheDir)
  const trackRepository = new TrackRepository(db)
  const libraryRootRepository = new LibraryRootRepository(db)
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
  const sendToRenderer = (channel: string, data: unknown) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(channel, data)
    }
  }
  const notifyLibraryChanged = (data: {
    reason: 'play-stats-updated' | 'play-stats-reset'
    trackIds: number[]
    filePaths: string[]
  }) => sendToRenderer(ipcChannels.library.changed, data)
  const markTrackFileMissing = (filePath: string) => {
    const trackIds = trackRepository.markMissingByFilePaths([filePath])
    if (trackIds.length > 0) {
      sendToRenderer(ipcChannels.library.changed, {
        reason: 'track-missing',
        trackIds,
        filePaths: [filePath],
      })
    }
  }
  const getAudioUrl = async (trackId: number) => {
    const filePath = trackRepository.getFilePathById(trackId)

    if (!filePath || !isPlayableAudioExtension(filePath)) {
      return null
    }

    const rootPaths = libraryRootRepository.list().map((root) => root.path)
    if (!isPathUnderAnyRoot(filePath, rootPaths)) {
      return null
    }

    try {
      const fileStats = await stat(filePath)
      if (!fileStats.isFile()) {
        markTrackFileMissing(filePath)
        return null
      }
    } catch (error) {
      if (isMissingFileError(error)) markTrackFileMissing(filePath)
      return null
    }

    return { url: buildAudioTrackUrl(trackId) }
  }
  const metadataWatchService = new MetadataWatchService(
    libraryRootRepository,
    trackRepository,
    metadataRefreshService,
    incrementalImportService,
    sendToRenderer,
  )

  // After user tag writes, suppress watch-driven refresh so mtime churn cannot
  // immediately re-parse and clobber user_edit metadata.
  metadataRefreshService.setTagWriteSuccessHandler((filePath) => {
    metadataWatchService.suppressRefreshForPath(filePath)
  })

  const artworkMaintenanceService = new ArtworkCacheMaintenanceService(
    new ArtworkCacheMigrationService(db, artworkCacheDir),
    new ArtworkCacheGarbageCollector(db, artworkCacheDir),
    {
      isScanActive: () => libraryScanService.isScanActive(),
      isRefreshActive: () => metadataRefreshService.hasActiveJob(),
      isImportActive: () => incrementalImportService.isImportActive(),
    },
  )
  // Migrate legacy artwork caches in the background without blocking the window.
  artworkMaintenanceService.scheduleStartupMaintenance()

  // Pause watch flush during full scan so concurrent imports are not marked missing.
  libraryScanService.setScanLifecycleHooks({
    onStart: () => metadataWatchService.pauseFlush(),
    onEnd: () => {
      metadataWatchService.resumeFlush()
      // A full scan re-derives all artwork keys — sweep the cache afterwards
      // (gated internally against any writer still being active).
      void artworkMaintenanceService.runAfterScanGarbageCollection().catch((error) => {
        logger.warn({ error }, 'Failed to run after-scan artwork garbage collection')
      })
    },
  })

  const playStatsService = new PlayStatsService(new PlayStatsRepository(db))
  const playlistRepository = new PlaylistRepository(db)
  const smartPlaylistRepository = new SmartPlaylistRepository(db)
  const smartPlaylistService = new SmartPlaylistService(smartPlaylistRepository, trackRepository)
  const playlistService = new PlaylistService(playlistRepository, smartPlaylistRepository)

  const getSmartTrackCounts = () =>
    new Map(
      smartPlaylistService
        .listTrackCounts()
        .map((item) => [item.playlistId, item.trackCount] as const),
    )

  const rendererEntry = process.env.ELECTRON_RENDERER_URL
    ? process.env.ELECTRON_RENDERER_URL
    : join(__dirname, '../renderer/index.html')
  const electronIpcRegistrar = createValidatedIpcRegistrar({
    register: (channel, listener) => ipcMain.handle(channel, listener),
    isTrustedSender: createTrustedMainWindowSourcePolicy({
      fromWebContents: (sender) => BrowserWindow.fromWebContents(sender),
      isAllowedWindow: (window) =>
        Boolean(getMiniPlayerWindowController(window as Electron.BrowserWindow)),
      isTrustedRendererUrl: (url) => isTrustedRendererUrl(url, rendererEntry),
    }),
  })

  metadataWatchService.start()
  app.on('before-quit', () => {
    metadataWatchService.stop()
  })

  registerDomainIpcHandlers(electronIpcRegistrar, {
    app: {
      getInfo: () => ({
        name: 'Auralis',
        version: app.getVersion(),
        databasePath: getDatabasePath(),
      }),
      exportDiagnostics: async (event) => {
        const parentWindow = BrowserWindow.fromWebContents(event.sender)
        if (!parentWindow) return { status: 'failed' as const }

        return exportDiagnostics({
          appVersion: app.getVersion(),
          logsDirectory: join(app.getPath('userData'), 'logs'),
          showSaveDialog: (options) => dialog.showSaveDialog(parentWindow, options),
        })
      },
    },
    database: {
      exportBackup: async (event) => {
        const parentWindow = BrowserWindow.fromWebContents(event.sender)
        if (!parentWindow) return { status: 'failed' as const, error: 'Window unavailable' }

        return exportDatabaseBackup({
          db,
          databasePath: getDatabasePath(),
          showSaveDialog: (options) => dialog.showSaveDialog(parentWindow, options),
        })
      },
      restoreBackup: async (event) => {
        const parentWindow = BrowserWindow.fromWebContents(event.sender)
        if (!parentWindow) return { status: 'failed' as const, error: 'Window unavailable' }

        return stageDatabaseRestore({
          currentDbPath: getDatabasePath(),
          showOpenDialog: (options) => dialog.showOpenDialog(parentWindow, options),
        })
      },
    },
    library: { libraryService, libraryScanService, metadataWatchService },
    playlists: { playlistService, smartPlaylistService, getSmartTrackCounts },
    playbackArchive: {
      libraryService,
      playStatsService,
      getAudioUrl,
      notifyLibraryChanged,
    },
    metadata: { metadataRefreshService },
    window: { getMiniPlayerController: getInvokingMiniPlayerController },
  })
}
