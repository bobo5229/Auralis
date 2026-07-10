import { app, BrowserWindow, ipcMain } from 'electron'
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { pathToFileURL } from 'node:url'
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
import { PlayStatsRepository } from '@main/repositories/playStatsRepository'
import { PlayStatsService } from '@main/services/playStatsService'
import { PlaylistRepository } from '@main/repositories/playlistRepository'
import { PlaylistService } from '@main/services/playlistService'
import { SmartPlaylistRepository } from '@main/repositories/smartPlaylistRepository'
import { SmartPlaylistService } from '@main/services/smartPlaylistService'
import type { IpcResponse } from '@shared/ipc/contracts'
import type { EditableTrackMetadata } from '@shared/types/libraryScan'
import type { PlaylistViewMode, SidebarPlaylistKind } from '@shared/types/playlist'
import type { SmartPlaylistRule, SmartPlaylistViewMode } from '@shared/types/smartPlaylist'
import type Database from 'better-sqlite3'

const PLAYABLE_AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.flac',
  '.m4a',
  '.aac',
  '.wav',
  '.ogg',
  '.opus',
])

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
  const sendToRenderer = (channel: string, data: unknown) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(channel, data)
    }
  }
  const metadataWatchService = new MetadataWatchService(
    new LibraryRootRepository(db),
    trackRepository,
    metadataRefreshService,
    incrementalImportService,
    sendToRenderer,
  )

  const playStatsService = new PlayStatsService(new PlayStatsRepository(db))
  const playlistRepository = new PlaylistRepository(db)
  const smartPlaylistRepository = new SmartPlaylistRepository(db)
  const smartPlaylistService = new SmartPlaylistService(smartPlaylistRepository, trackRepository)
  const playlistService = new PlaylistService(
    playlistRepository,
    smartPlaylistRepository,
    trackRepository,
  )

  const getSmartTrackCounts = () =>
    new Map(
      smartPlaylistService
        .listTrackCounts()
        .map((item) => [item.playlistId, item.trackCount] as const),
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
    ipcChannels.smartPlaylists.list,
    (): IpcResponse<'smart-playlists:list'> => smartPlaylistService.list(),
  )

  ipcMain.handle(
    ipcChannels.smartPlaylists.listTrackCounts,
    (): IpcResponse<'smart-playlists:list-track-counts'> => smartPlaylistService.listTrackCounts(),
  )

  ipcMain.handle(
    ipcChannels.smartPlaylists.getDetail,
    (_event, payload: { id: number }): IpcResponse<'smart-playlists:get-detail'> =>
      smartPlaylistService.getDetail(payload.id),
  )

  ipcMain.handle(
    ipcChannels.smartPlaylists.create,
    (
      _event,
      payload: { name: string; rule: SmartPlaylistRule },
    ): IpcResponse<'smart-playlists:create'> =>
      smartPlaylistService.create(payload.name, payload.rule),
  )

  ipcMain.handle(
    ipcChannels.smartPlaylists.createFromQuery,
    (_event, payload: { query: string }): IpcResponse<'smart-playlists:create-from-query'> =>
      smartPlaylistService.createFromQuery(payload.query),
  )

  ipcMain.handle(
    ipcChannels.smartPlaylists.rename,
    (_event, payload: { id: number; name: string }): IpcResponse<'smart-playlists:rename'> =>
      smartPlaylistService.rename(payload.id, payload.name),
  )

  ipcMain.handle(
    ipcChannels.smartPlaylists.updateViewMode,
    (
      _event,
      payload: { id: number; viewMode: SmartPlaylistViewMode },
    ): IpcResponse<'smart-playlists:update-view-mode'> =>
      smartPlaylistService.updateViewMode(payload.id, payload.viewMode),
  )

  ipcMain.handle(
    ipcChannels.smartPlaylists.delete,
    (_event, payload: { id: number }): IpcResponse<'smart-playlists:delete'> => ({
      deleted: smartPlaylistService.delete(payload.id),
    }),
  )

  ipcMain.handle(
    ipcChannels.smartPlaylists.reorder,
    (_event, payload: { ids: number[] }): IpcResponse<'smart-playlists:reorder'> =>
      smartPlaylistService.reorder(payload.ids),
  )

  ipcMain.handle(
    ipcChannels.playlists.list,
    (): IpcResponse<'playlists:list'> => playlistService.list(),
  )

  ipcMain.handle(
    ipcChannels.playlists.listTrackCounts,
    (): IpcResponse<'playlists:list-track-counts'> => playlistService.listTrackCounts(),
  )

  ipcMain.handle(
    ipcChannels.playlists.listSidebarItems,
    (): IpcResponse<'playlists:list-sidebar-items'> =>
      playlistService.listSidebarItems(getSmartTrackCounts()),
  )

  ipcMain.handle(
    ipcChannels.playlists.getDetail,
    (_event, payload: { id: number }): IpcResponse<'playlists:get-detail'> =>
      playlistService.getDetail(payload.id),
  )

  ipcMain.handle(
    ipcChannels.playlists.create,
    (): IpcResponse<'playlists:create'> => playlistService.create(),
  )

  ipcMain.handle(
    ipcChannels.playlists.rename,
    (_event, payload: { id: number; name: string }): IpcResponse<'playlists:rename'> =>
      playlistService.rename(payload.id, payload.name),
  )

  ipcMain.handle(
    ipcChannels.playlists.updateViewMode,
    (
      _event,
      payload: { id: number; viewMode: PlaylistViewMode },
    ): IpcResponse<'playlists:update-view-mode'> =>
      playlistService.updateViewMode(payload.id, payload.viewMode),
  )

  ipcMain.handle(
    ipcChannels.playlists.delete,
    (_event, payload: { id: number }): IpcResponse<'playlists:delete'> => ({
      deleted: playlistService.delete(payload.id),
    }),
  )

  ipcMain.handle(
    ipcChannels.playlists.addTracks,
    (_event, payload: { id: number; trackIds: number[] }): IpcResponse<'playlists:add-tracks'> =>
      playlistService.addTracks(payload.id, payload.trackIds),
  )

  ipcMain.handle(
    ipcChannels.playlists.reorderSidebarItems,
    (
      _event,
      payload: { items: Array<{ kind: SidebarPlaylistKind; id: number }> },
    ): IpcResponse<'playlists:reorder-sidebar-items'> => {
      playlistService.reorderSidebarItems(payload.items)
      return playlistService.listSidebarItems(getSmartTrackCounts())
    },
  )

  ipcMain.handle(
    ipcChannels.lyrics.getByTrackId,
    (_event, payload: { trackId: number }): IpcResponse<'lyrics:get-by-track-id'> =>
      libraryService.getLyrics(payload.trackId),
  )

  ipcMain.handle(
    ipcChannels.playback.getAudioUrl,
    async (
      _event,
      payload: { trackId: number },
    ): Promise<IpcResponse<'playback:get-audio-url'>> => {
      const filePath = trackRepository.getFilePathById(payload.trackId)

      if (!filePath) {
        return null
      }

      const ext = extname(filePath).toLowerCase()

      if (!PLAYABLE_AUDIO_EXTENSIONS.has(ext)) {
        return null
      }

      const fileStats = await stat(filePath)

      if (!fileStats.isFile()) {
        return null
      }

      return { url: pathToFileURL(filePath).toString() }
    },
  )

  ipcMain.handle(
    ipcChannels.playback.getRandomTrack,
    (_event, payload?: { excludeTrackId?: number }): IpcResponse<'playback:get-random-track'> =>
      libraryService.getRandomTrack(payload?.excludeTrackId),
  )

  ipcMain.handle(
    ipcChannels.playback.getRandomAlbumTracks,
    (
      _event,
      payload?: { excludeAlbumKey?: { albumArtist: string; album: string } },
    ): IpcResponse<'playback:get-random-album-tracks'> =>
      libraryService.getRandomAlbumTracks(payload?.excludeAlbumKey),
  )

  ipcMain.handle(
    ipcChannels.playback.getAlbumTracks,
    (
      _event,
      payload: { albumKey: { albumArtist: string; album: string } },
    ): IpcResponse<'playback:get-album-tracks'> => libraryService.getAlbumTracks(payload.albumKey),
  )

  ipcMain.handle(
    ipcChannels.playback.recordEffectivePlay,
    (
      _event,
      payload: { trackId: number; sessionId: string; playedAtIso: string },
    ): IpcResponse<'playback:record-effective-play'> => {
      const result = playStatsService.recordEffectivePlay(payload)
      if (result.ok) {
        sendToRenderer(ipcChannels.library.changed, {
          reason: 'play-stats-updated',
          trackIds: [payload.trackId],
          filePaths: [],
        })
      }
      return result
    },
  )

  ipcMain.handle(
    ipcChannels.archive.getListeningHeatmap,
    (_event, payload: { year: number }): IpcResponse<'archive:get-listening-heatmap'> =>
      playStatsService.getListeningHeatmap(payload.year),
  )

  ipcMain.handle(
    ipcChannels.archive.getDailyListeningDetail,
    (_event, payload: { date: string }): IpcResponse<'archive:get-daily-listening-detail'> =>
      playStatsService.getDailyListeningDetail(payload.date),
  )

  ipcMain.handle(
    ipcChannels.archive.getAnnualListeningInsights,
    (_event, payload: { year: number }): IpcResponse<'archive:get-annual-listening-insights'> =>
      playStatsService.getAnnualListeningInsights(payload.year),
  )

  ipcMain.handle(
    ipcChannels.archive.getListeningRanking,
    (
      _event,
      payload: Parameters<typeof playStatsService.getListeningRanking>[0],
    ): IpcResponse<'archive:get-listening-ranking'> =>
      playStatsService.getListeningRanking(payload),
  )

  ipcMain.handle(
    ipcChannels.archive.resetPlayStats,
    (): IpcResponse<'archive:reset-play-stats'> => {
      const result = playStatsService.resetAll()
      sendToRenderer(ipcChannels.library.changed, {
        reason: 'play-stats-reset',
        trackIds: [],
        filePaths: [],
      })
      return result
    },
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
    ipcChannels.metadata.clearRefreshFailures,
    (): IpcResponse<'metadata:clear-refresh-failures'> => metadataRefreshService.clearFailures(),
  )

  ipcMain.handle(
    ipcChannels.metadata.getTrackMetadata,
    (_event, payload: { trackId: number }): IpcResponse<'metadata:get-track-metadata'> =>
      metadataRefreshService.getTrackMetadata(payload.trackId),
  )

  ipcMain.handle(
    ipcChannels.metadata.updateTrackMetadata,
    (
      _event,
      payload: EditableTrackMetadata,
    ): Promise<IpcResponse<'metadata:update-track-metadata'>> =>
      metadataRefreshService.updateTrackMetadata(payload),
  )

  // Window control handlers
  ipcMain.handle(ipcChannels.window.minimize, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
    return { ok: true }
  })

  ipcMain.handle(ipcChannels.window.toggleMaximize, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { ok: false }
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
    return { ok: true }
  })

  ipcMain.handle(ipcChannels.window.close, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
    return { ok: true }
  })

  ipcMain.handle(ipcChannels.window.isMaximized, (event) => {
    return { maximized: BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false }
  })
}
