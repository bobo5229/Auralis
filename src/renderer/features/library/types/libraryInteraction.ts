import type { RevealInExplorerResult } from '@shared/ipc/contracts'

export type LibraryViewMode = 'flat' | 'cover'
export type LibraryContextMenuSource = 'track' | 'album-artwork'
export type LibraryContextMenuOpenReason = 'pointer' | 'keyboard'
export type LibraryStatusKind = 'loading' | 'scanning' | 'empty' | 'error'

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

export interface LibraryFocusTarget {
  trackId: number
  source: LibraryContextMenuSource
  openReason?: 'pointer' | 'keyboard'
}
