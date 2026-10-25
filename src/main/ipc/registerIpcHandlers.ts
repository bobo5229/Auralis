import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { PlaylistChangedEvent } from '@shared/types/playlistEvents'
import { ipcChannels } from '@shared/ipc/channels'
import { isRegisteredMainWindow } from '@main/app/mainWindowRegistry'
import { getWindowVisibility } from '@main/app/windowVisibility'
import { claimCdStartupEntry } from '@main/app/cdStartupSession'
import { claimStartupAlbum } from '@main/app/startupAlbumSession'
import { getNativeUiMessages, setNativeUiLocale } from '@main/app/uiLocale'
import { isTrustedRendererUrl } from '@main/app/webContentsSecurity'
import { getDatabasePath } from '@main/database/connection'
import { exportDatabaseBackup, stageDatabaseRestore } from '@main/database/databaseBackupService'
import { ArtworkCacheGarbageCollector } from '@main/features/artwork/artworkCacheGarbageCollector'
import { ArtworkCacheMaintenanceService } from '@main/features/artwork/artworkCacheMaintenanceService'
import { ArtworkCacheMigrationService } from '@main/features/artwork/artworkCacheMigrationService'
import { NativePlaybackService } from '@main/features/audio/nativePlaybackService'
import { PlaybackSpectrumService } from '@main/features/audio/playbackSpectrumService'
import { PlaybackFileCoordinator } from '@main/features/audio/playbackFileCoordinator'
import { RendererReadLeaseOwner } from '@main/features/audio/rendererReadLeaseOwner'
import { resolveAudioRuntimePaths } from '@main/features/audio/audioRuntimePaths'
import { LibraryIncrementalImportService } from '@main/features/libraryScan/libraryIncrementalImportService'
import { selectLibraryDirectory } from '@main/app/selectLibraryDirectory'
import { createLibraryScanEvents } from './libraryScanEvents'
import { LibraryScanService } from '@main/features/libraryScan/libraryScanService'
import { MetadataRefreshService } from '@main/features/metadata/metadataRefreshService'
import { MetadataWatchService } from '@main/features/metadata/metadataWatchService'
import { LrcEditorService } from '@main/features/lyrics/lrcEditorService'
import { StartupAlbumWorkerHost } from '@main/features/startupAlbum/startupAlbumWorkerHost'
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
import { LrcEditorMetadataService } from '@main/services/lrcEditorMetadataService'
import { PlaybackResourceService } from '@main/services/playbackResourceService'
import { PlaylistService } from '@main/services/playlistService'
import { PlayStatsService } from '@main/services/playStatsService'
import { SmartPlaylistService } from '@main/services/smartPlaylistService'
import type Database from 'better-sqlite3'
import type { WindowBehaviorController } from '@main/app/windowBehaviorController'
import { registerLibraryIpcHandlers } from './registerLibraryIpcHandlers'
import { registerMetadataIpcHandlers } from './registerMetadataIpcHandlers'
import { registerLyricsEditorIpcHandlers } from './registerLyricsEditorIpcHandlers'
import { registerPlaybackArchiveIpcHandlers } from './registerPlaybackArchiveIpcHandlers'
import { registerPlaylistIpcHandlers } from './registerPlaylistIpcHandlers'
import { createRendererEventSender } from './rendererEvents'
import { createMetadataRefreshEvents } from './metadataRefreshEvents'
import {
  createTrustedMainWindowSourcePolicy,
  createValidatedIpcRegistrar,
} from './validatedIpcRegistrar'

export function registerIpcHandlers(
  db: Database.Database,
  artworkCacheDir: string,
  windowBehavior: WindowBehaviorController,
): { shutdown(): Promise<void> } {
  const sendToRenderer = createRendererEventSender(() => BrowserWindow.getAllWindows())
  const audioPaths = resolveAudioRuntimePaths({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
  })
  const libraryService = new LibraryService(new LibraryRepository(db), new TrackRepository(db))
  const startupAlbumWorker = new StartupAlbumWorkerHost(db.name)
  const scanEvents = createLibraryScanEvents(sendToRenderer)
  const libraryScanService = new LibraryScanService(
    db,
    artworkCacheDir,
    selectLibraryDirectory,
    scanEvents,
  )
  const trackRepository = new TrackRepository(db)
  const libraryRootRepository = new LibraryRootRepository(db)
  const playbackFileCoordinator = new PlaybackFileCoordinator({
    getTrackFilePath: (trackId) => trackRepository.getFilePathById(trackId),
    getTrackIdsByFilePath: (filePath) => trackRepository.getTrackIdsByPlaybackPath(filePath),
    sendToRenderer,
  })
  const metadataRefreshService = new MetadataRefreshService(
    new MetadataRefreshRepository(db),
    artworkCacheDir,
    createMetadataRefreshEvents(sendToRenderer),
    audioPaths.ffmpegPath,
    playbackFileCoordinator,
    () => trackRepository.getChangeToken(),
  )
  const incrementalImportService = new LibraryIncrementalImportService(
    trackRepository,
    artworkCacheDir,
    scanEvents.changed,
  )

  const notifyLibraryChanged = (data: {
    reason: 'play-stats-updated' | 'play-stats-reset'
    trackIds: number[]
    filePaths: string[]
  }) => sendToRenderer(ipcChannels.library.changed, data)
  const playbackResources = new PlaybackResourceService({
    tracks: trackRepository,
    getRootPaths: () => libraryRootRepository.list().map((root) => root.path),
    files: playbackFileCoordinator,
    libraryChanged: (event) => sendToRenderer(ipcChannels.library.changed, event),
  })
  const getAudioUrl = (trackId: number) => playbackResources.getAudioUrl(trackId)
  const metadataWatchService = new MetadataWatchService(
    libraryRootRepository,
    trackRepository,
    metadataRefreshService,
    incrementalImportService,
    sendToRenderer,
  )

  const lrcEditorMetadata = new LrcEditorMetadataService({
    tracks: trackRepository,
    metadata: metadataRefreshService,
    files: playbackFileCoordinator,
    libraryChanged: (event) => sendToRenderer(ipcChannels.library.changed, event),
  })
  const lrcEditorService = new LrcEditorService({
    getFilePath: (id) => trackRepository.getFilePathById(id),
    getRoots: () => libraryRootRepository.list().map((root) => root.path),
    readSource: (filePath) => lrcEditorMetadata.readSource(filePath),
    writeTag: (trackId, text, beforeCommit) =>
      lrcEditorMetadata.writeTag(trackId, text, beforeCommit),
    reconcile: (trackId, filePath, text) => lrcEditorMetadata.reconcile(trackId, filePath, text),
  })

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
      isRefreshActive: () => metadataRefreshService.hasActiveArtworkWrites(),
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
      // The synchronous end hook returns before scan ownership is released.
      queueMicrotask(() => {
        void artworkMaintenanceService.runAfterScanGarbageCollection().catch((error) => {
          logger.warn({ error }, 'Failed to run after-scan artwork garbage collection')
        })
      })
    },
  })

  libraryScanService.setRootChangeHooks({
    onStart: () => metadataWatchService.pauseFlush(),
    onEnd: () => {
      metadataWatchService.syncRoots()
      metadataWatchService.resumeFlush()
    },
  })

  const playStatsService = new PlayStatsService(new PlayStatsRepository(db))
  const playlistRepository = new PlaylistRepository(db)
  const smartPlaylistRepository = new SmartPlaylistRepository(db)
  const publishPlaylistChange = (event: PlaylistChangedEvent) =>
    sendToRenderer(ipcChannels.playlists.changed, event)
  const smartPlaylistService = new SmartPlaylistService(
    smartPlaylistRepository,
    trackRepository,
    publishPlaylistChange,
  )
  const playlistService = new PlaylistService(
    playlistRepository,
    smartPlaylistRepository,
    publishPlaylistChange,
  )

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
      isAllowedWindow: (window) => isRegisteredMainWindow(window as Electron.BrowserWindow),
      isTrustedRendererUrl: (url) => isTrustedRendererUrl(url, rendererEntry),
    }),
  })

  metadataWatchService.start()
  const resolvePlaybackTrack = (trackId: number) => playbackResources.resolveTrack(trackId)
  const spectrum = new PlaybackSpectrumService({
    ffmpegPath: audioPaths.ffmpegPath,
    resolveTrack: resolvePlaybackTrack,
    coordinator: playbackFileCoordinator,
    emit: (frame) => sendToRenderer(ipcChannels.playback.spectrumFrame, frame),
    warn: (error) => logger.warn({ error }, 'Playback spectrum analysis failed'),
  })
  const spectrumOwners = new WeakSet<Electron.WebContents>()
  electronIpcRegistrar.handle(ipcChannels.playback.spectrumSubscribe, (event, request) => {
    if (!spectrumOwners.has(event.sender)) {
      spectrumOwners.add(event.sender)
      event.sender.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
        if (isMainFrame && !isInPlace) void spectrum.dispose()
      })
      event.sender.once('destroyed', () => {
        void spectrum.dispose()
      })
      event.sender.on('render-process-gone', () => {
        void spectrum.dispose()
      })
    }
    return spectrum.subscribe(request, nativePlayback.getSpectrumSource())
  })
  const nativePlayback = new NativePlaybackService({
    ...audioPaths,
    resolveTrack: resolvePlaybackTrack,
    coordinator: playbackFileCoordinator,
    suspendFileReaders: (filePath) => spectrum.suspendFileReaders(filePath),
    emit: (event) => {
      sendToRenderer(ipcChannels.playback.nativeEvent, event)
      spectrum.syncNative(nativePlayback.getSpectrumSource())
    },
    warn: (error) => logger.warn({ error }, 'Native playback operation failed'),
    onBoundaryStatus: (event) => logger.debug(event, 'Digital silence boundary analysis'),
  })
  playbackFileCoordinator.setMetadataWriteActivity((filePath) =>
    metadataRefreshService.isWritingFile(filePath),
  )
  playbackFileCoordinator.setBufferedWriteCapability((filePath) =>
    nativePlayback.canWriteMetadata(filePath),
  )
  playbackFileCoordinator.setFileReplacementCapability((filePath) =>
    nativePlayback.canReplaceMetadata(filePath),
  )
  metadataRefreshService.setPlaybackTagWriteHandler((filePath, metadata, commitAndReconcile) =>
    nativePlayback.writeMetadata(filePath, metadata, commitAndReconcile),
  )
  const nativeOwners = new WeakSet<Electron.WebContents>()
  electronIpcRegistrar.handle(ipcChannels.playback.nativeAvailability, () => {
    const available = existsSync(audioPaths.mpvPath)
    return { available, ...(!available ? { reason: 'mpv runtime is not installed' } : {}) }
  })
  electronIpcRegistrar.handle(ipcChannels.playback.nativeCommand, (event, request) => {
    if (!nativeOwners.has(event.sender)) {
      nativeOwners.add(event.sender)
      event.sender.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
        if (isMainFrame && !isInPlace) nativePlayback.dispose()
      })
      event.sender.once('destroyed', () => nativePlayback.dispose())
      event.sender.on('render-process-gone', () => nativePlayback.dispose())
    }
    return nativePlayback.command(request)
  })

  const rendererLeaseOwners = new RendererReadLeaseOwner(playbackFileCoordinator)
  electronIpcRegistrar.handle(ipcChannels.playback.acquireReadLease, async (event, payload) => {
    const filePath = trackRepository.getFilePathById(payload.trackId)
    if (!filePath) throw new Error(`Audio file not found for track ${payload.trackId}`)
    return rendererLeaseOwners.acquire(event.sender, filePath)
  })
  electronIpcRegistrar.handle(ipcChannels.playback.releaseReadLease, (event, payload) => {
    rendererLeaseOwners.release(event.sender, payload.leaseId)
    return { ok: true }
  })

  electronIpcRegistrar.handle(ipcChannels.app.claimCdStartupEntry, claimCdStartupEntry)
  electronIpcRegistrar.handle(ipcChannels.app.claimStartupAlbum, (_event, request) =>
    claimStartupAlbum(() =>
      startupAlbumWorker.getStartupAlbumTracks(
        request?.recentAlbums ?? (request?.excludeAlbumKey ? [request.excludeAlbumKey] : []),
      ),
    ),
  )
  electronIpcRegistrar.handle(ipcChannels.app.drawStartupAlbum, async (_event, request) => ({
    album: await startupAlbumWorker.getStartupAlbumTracks(request.recentAlbums),
  }))
  electronIpcRegistrar.handle(ipcChannels.app.setLocale, (_event, payload) => {
    setNativeUiLocale(payload.locale)
  })
  electronIpcRegistrar.handle(ipcChannels.app.getInfo, () => ({
    name: 'Auralis',
    version: app.getVersion(),
    databasePath: getDatabasePath(),
  }))
  electronIpcRegistrar.handle(ipcChannels.app.exportDiagnostics, async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender)
    if (!parentWindow) return { status: 'failed' as const }

    return exportDiagnostics({
      appVersion: app.getVersion(),
      logsDirectory: join(app.getPath('userData'), 'logs'),
      showSaveDialog: (options) => dialog.showSaveDialog(parentWindow, options),
    })
  })
  electronIpcRegistrar.handle(ipcChannels.database.exportBackup, async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender)
    if (!parentWindow) return { status: 'failed' as const, error: 'Window unavailable' }

    return exportDatabaseBackup({
      db,
      databasePath: getDatabasePath(),
      showSaveDialog: (options) =>
        dialog.showSaveDialog(parentWindow, {
          ...options,
          title: getNativeUiMessages().exportBackup,
          filters: options.filters?.map((filter) => ({
            ...filter,
            name: getNativeUiMessages().backupFilter,
          })),
        }),
    })
  })
  electronIpcRegistrar.handle(ipcChannels.database.restoreBackup, async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender)
    if (!parentWindow) return { status: 'failed' as const, error: 'Window unavailable' }

    return stageDatabaseRestore({
      currentDbPath: getDatabasePath(),
      showOpenDialog: (options) =>
        dialog.showOpenDialog(parentWindow, {
          ...options,
          title: getNativeUiMessages().restoreBackup,
          filters: options.filters?.map((filter) => ({
            ...filter,
            name: getNativeUiMessages().backupFilter,
          })),
        }),
    })
  })
  electronIpcRegistrar.handle(ipcChannels.window.getMaximized, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || !isRegisteredMainWindow(window)) {
      throw new Error('Main window controls are unavailable.')
    }
    return { isMaximized: window.isMaximized() }
  })
  electronIpcRegistrar.handle(ipcChannels.window.getVisibility, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || !isRegisteredMainWindow(window)) {
      throw new Error('Main window visibility is unavailable.')
    }
    return getWindowVisibility(window)
  })
  electronIpcRegistrar.handle(ipcChannels.window.getCloseBehavior, () => windowBehavior.getState())
  electronIpcRegistrar.handle(ipcChannels.window.setCloseBehavior, (_event, payload) =>
    windowBehavior.setBehavior(payload.behavior),
  )
  electronIpcRegistrar.handle(ipcChannels.window.control, (event, payload) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || !isRegisteredMainWindow(window)) {
      throw new Error('Main window controls are unavailable.')
    }
    switch (payload.action) {
      case 'minimize':
        window.minimize()
        break
      case 'toggle-maximize':
        if (window.isMaximized()) window.unmaximize()
        else window.maximize()
        break
      case 'close':
        setImmediate(() => {
          if (!window.isDestroyed()) window.close()
        })
        break
    }
    return { isMaximized: window.isMaximized() }
  })

  registerLibraryIpcHandlers(electronIpcRegistrar, {
    libraryService,
    libraryScanService,
    metadataWatchService,
    revealInExplorer: {
      getFilePathById: (trackId) => trackRepository.getFilePathById(trackId),
      getRootPaths: () => libraryRootRepository.list().map((root) => root.path),
      stat,
      showItemInFolder: (filePath) => {
        shell.showItemInFolder(filePath)
      },
      openPath: (directoryPath) => shell.openPath(directoryPath),
    },
  })
  registerLyricsEditorIpcHandlers(electronIpcRegistrar, lrcEditorService)
  registerPlaylistIpcHandlers(electronIpcRegistrar, {
    playlistService,
    smartPlaylistService,
    getSmartTrackCounts,
  })
  registerPlaybackArchiveIpcHandlers(electronIpcRegistrar, {
    libraryService,
    playStatsService,
    getAudioUrl,
    notifyLibraryChanged,
  })
  registerMetadataIpcHandlers(electronIpcRegistrar, {
    metadataRefreshService,
    playbackFileCoordinator,
  })

  return {
    async shutdown() {
      rendererLeaseOwners.dispose()
      const early = await Promise.allSettled([
        electronIpcRegistrar.shutdown(),
        startupAlbumWorker.shutdown(),
        artworkMaintenanceService.shutdown(),
      ])
      const library = await Promise.allSettled([
        libraryScanService.shutdown(),
        metadataRefreshService.shutdown(),
      ])
      const playback = await Promise.allSettled([
        metadataWatchService.stop(),
        spectrum.dispose(),
        Promise.resolve().then(() => nativePlayback.dispose()),
      ])
      lrcEditorService.dispose()
      const failures = [...early, ...library, ...playback].filter(
        (result) => result.status === 'rejected',
      )
      if (failures.length > 0) {
        throw new AggregateError(
          failures.map((result) => result.reason),
          'Service shutdown failed',
        )
      }
    },
  }
}
