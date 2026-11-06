import { ipcChannels } from '@shared/ipc/channels'
import { getNativeUiMessages } from '@main/app/uiLocale'
import type { PlaylistViewMode, SidebarPlaylistKind } from '@shared/types/playlist'
import type { SmartPlaylistRule, SmartPlaylistViewMode } from '@shared/types/smartPlaylist'
import type { PlaylistService } from '@main/services/playlistService'
import type { SmartPlaylistService } from '@main/services/smartPlaylistService'
import type { IpcHandlerRegistrar } from './validatedIpcRegistrar'

type PlaylistOperations = Pick<
  PlaylistService,
  | 'list'
  | 'listTrackCounts'
  | 'listSidebarItems'
  | 'getDetail'
  | 'getMembership'
  | 'create'
  | 'rename'
  | 'updateViewMode'
  | 'delete'
  | 'addTracks'
  | 'reorderSidebarItems'
>

type SmartPlaylistOperations = Pick<
  SmartPlaylistService,
  | 'list'
  | 'listTrackCounts'
  | 'getDetail'
  | 'getMembership'
  | 'create'
  | 'getDetailAsync'
  | 'listTrackCountsAsync'
  | 'createFromQuery'
  | 'createRecentAdded'
  | 'updateRecentAddedDays'
  | 'rename'
  | 'updateViewMode'
  | 'delete'
  | 'reorder'
>

export interface PlaylistIpcDependencies {
  playlistService: PlaylistOperations
  smartPlaylistService: SmartPlaylistOperations
  getSmartTrackCounts(): Map<number, number> | Promise<Map<number, number>>
}

export function registerPlaylistIpcHandlers(
  registrar: IpcHandlerRegistrar,
  dependencies: PlaylistIpcDependencies,
): void {
  const { playlistService, smartPlaylistService, getSmartTrackCounts } = dependencies

  registrar.handle(ipcChannels.smartPlaylists.list, () => smartPlaylistService.list())
  registrar.handle(ipcChannels.smartPlaylists.listTrackCounts, () =>
    smartPlaylistService.listTrackCountsAsync(),
  )
  registrar.handle(ipcChannels.smartPlaylists.getMembership, (_event, payload: { id: number }) =>
    smartPlaylistService.getMembership(payload.id),
  )
  registrar.handle(ipcChannels.smartPlaylists.getDetail, (_event, payload: { id: number }) =>
    smartPlaylistService.getDetailAsync(payload.id),
  )
  registrar.handle(
    ipcChannels.smartPlaylists.create,
    (_event, payload: { name: string; rule: SmartPlaylistRule }) =>
      smartPlaylistService.create(payload.name, payload.rule),
  )
  registrar.handle(
    ipcChannels.smartPlaylists.createFromQuery,
    (_event, payload: { query: string }) => smartPlaylistService.createFromQuery(payload.query),
  )
  registrar.handle(
    ipcChannels.smartPlaylists.createRecentAdded,
    (_event, payload: { days?: number }) =>
      smartPlaylistService.createRecentAdded(payload.days, getNativeUiMessages().recentAdded),
  )
  registrar.handle(
    ipcChannels.smartPlaylists.updateRecentAddedDays,
    (_event, payload: { id: number; days: number }) =>
      smartPlaylistService.updateRecentAddedDays(payload.id, payload.days),
  )
  registrar.handle(
    ipcChannels.smartPlaylists.rename,
    (_event, payload: { id: number; name: string }) =>
      smartPlaylistService.rename(payload.id, payload.name),
  )
  registrar.handle(
    ipcChannels.smartPlaylists.updateViewMode,
    (_event, payload: { id: number; viewMode: SmartPlaylistViewMode }) =>
      smartPlaylistService.updateViewMode(payload.id, payload.viewMode),
  )
  registrar.handle(ipcChannels.smartPlaylists.delete, (_event, payload: { id: number }) => ({
    deleted: smartPlaylistService.delete(payload.id),
  }))
  registrar.handle(ipcChannels.smartPlaylists.reorder, (_event, payload: { ids: number[] }) =>
    smartPlaylistService.reorder(payload.ids),
  )

  registrar.handle(ipcChannels.playlists.list, () => playlistService.list())
  registrar.handle(ipcChannels.playlists.listTrackCounts, () => playlistService.listTrackCounts())
  registrar.handle(ipcChannels.playlists.listSidebarItems, async () =>
    playlistService.listSidebarItems(await getSmartTrackCounts()),
  )
  registrar.handle(ipcChannels.playlists.getMembership, (_event, payload: { id: number }) =>
    playlistService.getMembership(payload.id),
  )
  registrar.handle(ipcChannels.playlists.getDetail, (_event, payload: { id: number }) =>
    playlistService.getDetail(payload.id),
  )
  registrar.handle(ipcChannels.playlists.create, () =>
    playlistService.create(getNativeUiMessages().newPlaylist),
  )
  registrar.handle(ipcChannels.playlists.rename, (_event, payload: { id: number; name: string }) =>
    playlistService.rename(payload.id, payload.name),
  )
  registrar.handle(
    ipcChannels.playlists.updateViewMode,
    (_event, payload: { id: number; viewMode: PlaylistViewMode }) =>
      playlistService.updateViewMode(payload.id, payload.viewMode),
  )
  registrar.handle(ipcChannels.playlists.delete, (_event, payload: { id: number }) => ({
    deleted: playlistService.delete(payload.id),
  }))
  registrar.handle(
    ipcChannels.playlists.addTracks,
    (_event, payload: { id: number; trackIds: number[] }) =>
      playlistService.addTracks(payload.id, payload.trackIds),
  )
  registrar.handle(
    ipcChannels.playlists.reorderSidebarItems,
    (_event, payload: { items: Array<{ kind: SidebarPlaylistKind; id: number }> }) => {
      playlistService.reorderSidebarItems(payload.items)
      // The write admission unit must finish synchronously. Normal navigation uses the async reader.
      const counts = new Map(
        smartPlaylistService.listTrackCounts().map((item) => [item.playlistId, item.trackCount]),
      )
      return playlistService.listSidebarItems(counts)
    },
  )
}
