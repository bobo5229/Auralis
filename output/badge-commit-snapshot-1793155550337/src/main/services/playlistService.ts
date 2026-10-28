import type { PlaylistChangedEvent } from '@shared/types/playlistEvents'
import type {
  AddPlaylistTracksResult,
  Playlist,
  PlaylistDetail,
  PlaylistTrackCount,
  PlaylistViewMode,
  SidebarPlaylistItem,
  SidebarPlaylistKind,
} from '@shared/types/playlist'
import type { SmartPlaylist } from '@shared/types/smartPlaylist'
import { PlaylistRepository } from '@main/repositories/playlistRepository'
import { SmartPlaylistRepository } from '@main/repositories/smartPlaylistRepository'

export class PlaylistService {
  constructor(
    private readonly playlistRepository: PlaylistRepository,
    private readonly smartPlaylistRepository: SmartPlaylistRepository,
    private readonly publishChange: (event: PlaylistChangedEvent) => void = () => {},
  ) {}

  list(): Playlist[] {
    return this.playlistRepository.list()
  }

  listTrackCounts(): PlaylistTrackCount[] {
    return this.playlistRepository.getTrackCounts()
  }

  listSidebarItems(smartTrackCounts: Map<number, number>): SidebarPlaylistItem[] {
    const regularItems = this.playlistRepository.list().map((playlist) => ({
      kind: 'playlist' as const,
      id: playlist.id,
      name: playlist.name,
      viewMode: playlist.viewMode,
      sortOrder: playlist.sortOrder,
      trackCount: 0,
      createdAt: playlist.createdAt,
      updatedAt: playlist.updatedAt,
    }))
    const regularCounts = new Map(
      this.playlistRepository.getTrackCounts().map((item) => [item.playlistId, item.trackCount]),
    )

    for (const item of regularItems) {
      item.trackCount = regularCounts.get(item.id) ?? 0
    }

    const smartItems = this.smartPlaylistRepository
      .list()
      .map((playlist) => this.toSidebarSmartItem(playlist, smartTrackCounts.get(playlist.id) ?? 0))

    return [...regularItems, ...smartItems].sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.createdAt.localeCompare(right.createdAt) ||
        left.kind.localeCompare(right.kind) ||
        left.id - right.id,
    )
  }

  getDetail(id: number): PlaylistDetail | null {
    const playlist = this.playlistRepository.getById(id)
    if (!playlist) return null

    return {
      playlist,
      tracks: this.playlistRepository.getTracks(id),
    }
  }

  create(defaultName = '新建歌单'): Playlist {
    const allNames = [
      ...this.playlistRepository.list().map((playlist) => playlist.name),
      ...this.smartPlaylistRepository.list().map((playlist) => playlist.name),
    ]
    const name = this.getAvailableName(defaultName, allNames)
    const playlist = this.playlistRepository.create(name, this.getNextSortOrder())
    this.publishChange({ kind: 'playlist', playlistId: playlist.id, reason: 'created' })
    return playlist
  }

  rename(id: number, name: string): Playlist | null {
    const playlist = this.playlistRepository.getById(id)
    if (!playlist) return null

    const otherNames = [
      ...this.playlistRepository
        .list()
        .filter((item) => item.id !== id)
        .map((item) => item.name),
      ...this.smartPlaylistRepository.list().map((item) => item.name),
    ]
    const renamed = this.playlistRepository.rename(
      id,
      this.getAvailableName(name, otherNames, false),
    )
    if (renamed) this.publishChange({ kind: 'playlist', playlistId: id, reason: 'renamed' })
    return renamed
  }

  updateViewMode(id: number, viewMode: PlaylistViewMode): Playlist | null {
    const playlist = this.playlistRepository.updateViewMode(id, viewMode)
    if (playlist)
      this.publishChange({ kind: 'playlist', playlistId: id, reason: 'view-mode-updated' })
    return playlist
  }

  delete(id: number): boolean {
    const deleted = this.playlistRepository.delete(id)
    if (deleted) this.publishChange({ kind: 'playlist', playlistId: id, reason: 'deleted' })
    return deleted
  }

  addTracks(id: number, trackIds: number[]): AddPlaylistTracksResult {
    const result = this.playlistRepository.addTracks(id, trackIds)
    if (result.addedCount > 0)
      this.publishChange({ kind: 'playlist', playlistId: id, reason: 'tracks-added' })
    return result
  }

  reorderSidebarItems(
    items: Array<{ kind: SidebarPlaylistKind; id: number }>,
  ): SidebarPlaylistItem[] {
    if (this.playlistRepository.reorderSidebarItems(items)) {
      this.publishChange({ kind: 'collection', reason: 'reordered' })
    }
    return this.listSidebarItems(new Map())
  }

  private toSidebarSmartItem(playlist: SmartPlaylist, trackCount: number): SidebarPlaylistItem {
    return {
      kind: 'smart',
      id: playlist.id,
      name: playlist.name,
      viewMode: playlist.viewMode,
      sortOrder: playlist.sortOrder,
      trackCount,
      createdAt: playlist.createdAt,
      updatedAt: playlist.updatedAt,
    }
  }

  private getNextSortOrder(): number {
    const orders = [
      ...this.playlistRepository.list().map((playlist) => playlist.sortOrder),
      ...this.smartPlaylistRepository.list().map((playlist) => playlist.sortOrder),
    ]
    return orders.length === 0 ? 0 : Math.max(...orders) + 1
  }

  private getAvailableName(
    base: string,
    existingNames: string[],
    appendInitialSuffix = true,
  ): string {
    const trimmedBase = base.trim()
    const fallbackBase = trimmedBase.length > 0 ? trimmedBase : '新建歌单'
    const names = new Set(existingNames.map((name) => name.trim().toLocaleLowerCase()))

    if (!appendInitialSuffix && !names.has(fallbackBase.toLocaleLowerCase())) {
      return fallbackBase
    }

    let suffix = appendInitialSuffix ? 1 : 2
    while (names.has(`${fallbackBase} ${suffix}`.toLocaleLowerCase())) suffix += 1
    return `${fallbackBase} ${suffix}`
  }
}
