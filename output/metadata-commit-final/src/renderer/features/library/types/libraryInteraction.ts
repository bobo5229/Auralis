import type { RevealInExplorerResult } from '@shared/ipc/contracts'
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

export interface LibraryPlaylistFeedback {
  playlistId: number | null
  kind: 'success' | 'info' | 'error'
  message: string
}

export interface LibraryRevealFeedback {
  kind: 'error'
  message: string
}

export type LibraryRevealRequest = (trackIds: number[]) => Promise<RevealInExplorerResult>

export type LibrarySearchOutcome =
  | { kind: 'idle' }
  | { kind: 'matched'; index: number; total: number; wrapped: boolean }
  | { kind: 'not-found' }

export interface LibraryContextMenuProps {
  open: boolean
  source: LibraryContextMenuSource
  anchor: LibraryContextMenuAnchor
  trackTitle: string
  albumTitle: string
  canLocateCurrent: boolean
  canInsert: boolean
  hideInsert?: boolean
  currentViewMode: LibraryViewMode
  playlists: SidebarPlaylistItem[]
  playlistFeedback: LibraryPlaylistFeedback | null
  revealFeedback: LibraryRevealFeedback | null
  playlistLoading: boolean
  playlistLoadError: string | null
  creatingPlaylist: boolean
}
