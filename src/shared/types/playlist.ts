import type { TrackListItem } from './libraryScan'
import type { SmartPlaylistViewMode } from './smartPlaylist'

export type PlaylistViewMode = 'flat' | 'cover'
export type SidebarPlaylistKind = 'playlist' | 'smart'

export interface Playlist {
  id: number
  name: string
  viewMode: PlaylistViewMode
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface PlaylistDetail {
  playlist: Playlist
  tracks: TrackListItem[]
}

export interface PlaylistTrackCount {
  playlistId: number
  trackCount: number
}

export interface AddPlaylistTracksResult {
  addedCount: number
}

export interface SidebarPlaylistItem {
  kind: SidebarPlaylistKind
  id: number
  name: string
  viewMode: PlaylistViewMode | SmartPlaylistViewMode
  sortOrder: number
  trackCount: number
  createdAt: string
  updatedAt: string
}
