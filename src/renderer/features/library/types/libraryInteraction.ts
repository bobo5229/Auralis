import type { SidebarPlaylistItem } from '@shared/types/playlist'

export type LibraryViewMode = 'flat' | 'cover'
export type LibraryContextMenuSource = 'track' | 'album-artwork'
export type LibraryContextMenuOpenReason = 'pointer' | 'keyboard'
export type LibraryStatusKind = 'loading' | 'scanning' | 'empty' | 'no-search-match' | 'error'

export interface LibraryContextMenuAnchor {
  clientX: number
  clientY: number
  returnFocusTrackId: number | null
  openReason: LibraryContextMenuOpenReason
}

export interface LibraryContextMenuState {
  trackId: number
  source: LibraryContextMenuSource
  anchor: LibraryContextMenuAnchor
}

export type LibrarySearchOutcome =
  | { kind: 'idle' }
  | { kind: 'matched'; index: number; total: number; wrapped: boolean }
  | { kind: 'not-found' }

export interface LibraryContextMenuProps {
  open: boolean
  presentation: 'modern' | 'manuscript'
  source: LibraryContextMenuSource
  anchor: LibraryContextMenuAnchor
  trackTitle: string
  albumTitle: string
  canLocateCurrent: boolean
  canInsert: boolean
  currentViewMode: LibraryViewMode
  playlists: SidebarPlaylistItem[]
  playlistFeedback: { playlistId: number; message: string } | null
  playlistLoading: boolean
  playlistLoadError: string | null
  creatingPlaylist: boolean
  refreshing: boolean
}
