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

  create(): Playlist {
    const allNames = [
      ...this.playlistRepository.list().map((playlist) => playlist.name),
      ...this.smartPlaylistRepository.list().map((playlist) => playlist.name),
    ]
    const name = this.getAvailableName('新建歌单', allNames)
    return this.playlistRepository.create(name, this.getNextSortOrder())
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
    return this.playlistRepository.rename(id, this.getAvailableName(name, otherNames, false))
  }

  updateViewMode(id: number, viewMode: PlaylistViewMode): Playlist | null {
    return this.playlistRepository.updateViewMode(id, viewMode)
  }

  delete(id: number): boolean {
    return this.playlistRepository.delete(id)
  }

  addTracks(id: number, trackIds: number[]): AddPlaylistTracksResult {
    const playlist = this.playlistRepository.getById(id)
    if (!playlist) return { addedCount: 0 }

    return { addedCount: this.playlistRepository.addTracks(id, trackIds) }
  }

  reorderSidebarItems(
    items: Array<{ kind: SidebarPlaylistKind; id: number }>,
  ): SidebarPlaylistItem[] {
    const existingItems = this.listSidebarItems(new Map())
    const existingKeys = new Set(existingItems.map((item) => this.toItemKey(item)))
    const requestedKeys = new Set(items.map((item) => this.toItemKey(item)))

    if (
      items.length !== existingItems.length ||
      requestedKeys.size !== items.length ||
      items.some((item) => !existingKeys.has(this.toItemKey(item)))
    ) {
      return existingItems
    }

    items.forEach((item, index) => {
      if (item.kind === 'playlist') {
        this.playlistRepository.setSortOrder(item.id, index)
      } else {
        this.smartPlaylistRepository.setSortOrder(item.id, index)
      }
    })

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

  private toItemKey(item: { kind: SidebarPlaylistKind; id: number }): string {
    return `${item.kind}:${item.id}`
  }
}
