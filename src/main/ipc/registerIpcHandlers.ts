import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
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
import { isPathUnderAnyRoot } from '@main/features/audio/audioPathGuard'
import { probeAudioDecode } from '@main/features/audio/audioDecodeProbe'
import { NativePlaybackService } from '@main/features/audio/nativePlaybackService'
import { PlaybackSpectrumService } from '@main/features/audio/playbackSpectrumService'
import { PlaybackFileCoordinator } from '@main/features/audio/playbackFileCoordinator'
import { RendererReadLeaseOwner } from '@main/features/audio/rendererReadLeaseOwner'
import { resolveAudioRuntimePaths } from '@main/features/audio/audioRuntimePaths'
import { isPlayableAudioExtension, buildAudioTrackUrl } from '@main/features/audio/audioProtocol'
import { LibraryIncrementalImportService } from '@main/features/libraryScan/libraryIncrementalImportService'
import { LibraryScanService } from '@main/features/libraryScan/libraryScanService'
import { MetadataRefreshService } from '@main/features/metadata/metadataRefreshService'
import { MetadataWatchService } from '@main/features/metadata/metadataWatchService'
import { parseAudioMetadata } from '@main/features/metadata/parseAudioMetadata'
import {
  getLyricsSidecarFingerprint,
  resolveLyricsForFile,
} from '@main/features/metadata/resolveLyricsForFile'
import { LyricsEditorService } from '@main/features/lyrics/lyricsEditorService'
import { LrcEditorService } from '@main/features/lyrics/lrcEditorService'
import { LyricsEditorError } from '@main/features/lyrics/lyricsEditorError'
import { captureLyricsFiles } from '@main/features/lyrics/lyricsEditorFiles'
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
import {
  createTrustedMainWindowSourcePolicy,
  createValidatedIpcRegistrar,
} from './validatedIpcRegistrar'

function isMissingFileError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

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
  const libraryScanService = new LibraryScanService(db, artworkCacheDir)
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
    sendToRenderer,
    audioPaths.ffmpegPath,
    playbackFileCoordinator,
    () => trackRepository.getChangeToken(),
  )
  const incrementalImportService = new LibraryIncrementalImportService(
    trackRepository,
    artworkCacheDir,
    sendToRenderer,
  )

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

    const probeLease = await playbackFileCoordinator.acquireReadLease(filePath, 'audio-probe')
    try {
      const fileStats = await stat(filePath)
      if (!fileStats.isFile()) {
        markTrackFileMissing(filePath)
        return null
      }
      return { url: buildAudioTrackUrl(trackId), decodeProbe: await probeAudioDecode(filePath) }
    } catch (error) {
      if (isMissingFileError(error)) markTrackFileMissing(filePath)
      return null
    } finally {
      playbackFileCoordinator.releaseReadLease(probeLease.leaseId)
    }
  }
  const metadataWatchService = new MetadataWatchService(
    libraryRootRepository,
    trackRepository,
    metadataRefreshService,
    incrementalImportService,
    sendToRenderer,
  )

  const lyricsEditorService = new LyricsEditorService({
    getFilePath: (trackId) => trackRepository.getFilePathById(trackId),
    getRoots: () => libraryRootRepository.list().map((root) => root.path),
    readSource: async (filePath) => {
      const lease = await playbackFileCoordinator.acquireReadLease(filePath, 'lyrics-editor')
      try {
        const metadata = await parseAudioMetadata(filePath, { skipCovers: true, duration: false })
        const lyrics = await resolveLyricsForFile(filePath, metadata)
        if (!lyrics) return null
        const duration = metadata.format.duration
        return {
          lyricsText: lyrics.text,
          lyricsFormat: lyrics.format,
          ...(duration !== undefined && Number.isFinite(duration) && duration > 0
            ? { durationMs: Math.round(duration * 1000) }
            : {}),
        }
      } finally {
        playbackFileCoordinator.releaseReadLease(lease.leaseId)
      }
    },
    persist: async (trackId, filePath, text) => {
      let updated = false
      try {
        if (trackRepository.getFilePathById(trackId) !== filePath) return false
        const fingerprint = await getLyricsSidecarFingerprint(filePath)
        const files = await captureLyricsFiles(filePath)
        const firstTtml = files.find((file) => /\.ttml$/i.test(file.path) && file.identity)
        if (
          firstTtml?.text !== text ||
          fingerprint !== (await getLyricsSidecarFingerprint(filePath))
        )
          return false
        const audio = await stat(filePath)
        trackRepository.patchLyrics([
          {
            filePath,
            lyricsText: text,
            lyricsFormat: 'ttml',
            lyricsCheckedMtimeMs: audio.mtimeMs,
            lyricsSidecarFingerprint: fingerprint,
          },
        ])
        updated = true
        return true
      } finally {
        sendToRenderer(ipcChannels.library.changed, {
          reason: 'file-change',
          trackIds: [trackId],
          filePaths: [filePath],
        })
        if (!updated) {
          try {
            metadataRefreshService.refreshTracksFromFileChanges([trackId])
          } catch (error) {
            logger.warn({ error, trackId }, 'Saved lyrics require cache reconciliation')
          }
        }
      }
    },
  })

  const lrcEditorService = new LrcEditorService({
    getFilePath: (id) => trackRepository.getFilePathById(id),
    getRoots: () => libraryRootRepository.list().map((root) => root.path),
    readSource: async (filePath) => {
      const lease = await playbackFileCoordinator.acquireReadLease(filePath, 'lrc-editor')
      try {
        const metadata = await parseAudioMetadata(filePath, { skipCovers: true, duration: false })
        const lyrics = await resolveLyricsForFile(filePath, metadata, true)
        const duration = metadata.format.duration
        return lyrics
          ? {
              lyricsText: lyrics.text,
              lyricsFormat: lyrics.format,
              ...(duration !== undefined && Number.isFinite(duration) && duration > 0
                ? { durationMs: Math.round(duration * 1000) }
                : {}),
            }
          : null
      } finally {
        playbackFileCoordinator.releaseReadLease(lease.leaseId)
      }
    },
    writeTag: async (trackId, text, beforeCommit) => {
      let committed = false
      let result: Awaited<ReturnType<typeof metadataRefreshService.updateTrackLyrics>>
      try {
        result = await metadataRefreshService.updateTrackLyrics(trackId, text, beforeCommit, () => {
          committed = true
        })
      } catch (error) {
        if (committed) return { warning: true }
        throw error
      }
      if (!result.ok && committed) return { warning: true }
      if (!result.ok)
        throw new LyricsEditorError(
          result.reason === 'file-changed' || result.reason === 'file-not-found'
            ? 'file-changed'
            : result.reason === 'write-in-progress'
              ? 'busy'
              : 'save-failed',
        )
      return { warning: false }
    },
    reconcile: async (trackId, filePath, text) => {
      let cacheUpdated = false
      let active = false
      const lease = await playbackFileCoordinator.acquireReadLease(filePath, 'lrc-editor-reconcile')
      try {
        if (trackRepository.getFilePathById(trackId) !== filePath) return { cacheUpdated, active }
        const before = await stat(filePath)
        const fingerprint = await getLyricsSidecarFingerprint(filePath)
        const metadata = await parseAudioMetadata(filePath, { skipCovers: true, duration: false })
        const lyrics = await resolveLyricsForFile(filePath, metadata)
        const after = await stat(filePath)
        if (
          before.size !== after.size ||
          before.mtimeMs !== after.mtimeMs ||
          fingerprint !== (await getLyricsSidecarFingerprint(filePath))
        )
          return { cacheUpdated, active }
        trackRepository.patchLyrics([
          {
            filePath,
            lyricsText: lyrics?.text ?? null,
            lyricsFormat: lyrics?.format ?? null,
            lyricsCheckedMtimeMs: after.mtimeMs,
            lyricsSidecarFingerprint: fingerprint,
          },
        ])
        cacheUpdated = true
        active = (lyrics?.text.trim() ?? '') === text.trim()
        return { cacheUpdated, active }
      } finally {
        playbackFileCoordinator.releaseReadLease(lease.leaseId)
        sendToRenderer(ipcChannels.library.changed, {
          reason: 'file-change',
          trackIds: [trackId],
          filePaths: [filePath],
        })
        if (!cacheUpdated) {
          try {
            metadataRefreshService.refreshTracksFromFileChanges([trackId])
          } catch (error) {
            logger.warn({ error, trackId }, 'LRC save requires cache reconciliation')
          }
        }
      }
    },
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
      isAllowedWindow: (window) => isRegisteredMainWindow(window as Electron.BrowserWindow),
      isTrustedRendererUrl: (url) => isTrustedRendererUrl(url, rendererEntry),
    }),
  })

  metadataWatchService.start()
  const resolvePlaybackTrack = async (trackId: number): Promise<string> => {
    if (!(await getAudioUrl(trackId))) throw new Error('Audio file is unavailable')
    const path = trackRepository.getFilePathById(trackId)
    if (!path) throw new Error('Audio file is unavailable')
    return path
  }
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
  })
  registerLyricsEditorIpcHandlers(electronIpcRegistrar, lyricsEditorService, lrcEditorService)
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
      // Stop producers immediately, and keep SQLite open while accepted work drains.
      const producers = await Promise.allSettled([
        electronIpcRegistrar.shutdown(),
        startupAlbumWorker.shutdown(),
        metadataWatchService.stop(),
        artworkMaintenanceService.shutdown(),
        spectrum.dispose(),
        Promise.resolve().then(() => nativePlayback.dispose()),
      ])
      const workers = await Promise.allSettled([
        libraryScanService.shutdown(),
        metadataRefreshService.shutdown(),
      ])
      lyricsEditorService.dispose()
      lrcEditorService.dispose()
      const failures = [...producers, ...workers].filter((result) => result.status === 'rejected')
      if (failures.length > 0) {
        throw new AggregateError(
          failures.map((result) => result.reason),
          'Service shutdown failed',
        )
      }
    },
  }
}
