import type { TrackListItem } from '@shared/types/libraryScan'
import type { PlaylistDetail } from '@shared/types/playlist'
import type { SmartPlaylistDetail } from '@shared/types/smartPlaylist'
import type { LibraryPageIdentity } from '../types/libraryPresentation'
import type { LibraryViewMode } from '../types/libraryInteraction'
import {
  createLibraryIdentity,
  createPlaylistIdentity,
  createSmartPlaylistIdentity,
} from './libraryPageIdentity'

export interface LibraryDataSnapshot {
  identity: LibraryPageIdentity
  tracks: TrackListItem[]
  viewMode: LibraryViewMode
}

export function createAllSongsLibrarySnapshot(
  tracks: TrackListItem[],
  viewMode: LibraryViewMode,
): LibraryDataSnapshot {
  return {
    identity: createLibraryIdentity(),
    tracks,
    viewMode,
  }
}

export function createPlaylistLibrarySnapshot(detail: PlaylistDetail): LibraryDataSnapshot {
  return {
    identity: createPlaylistIdentity(detail.playlist.id, detail.playlist.name),
    tracks: detail.tracks,
    viewMode: detail.playlist.viewMode,
  }
}

export function createSmartPlaylistLibrarySnapshot(
  detail: SmartPlaylistDetail,
): LibraryDataSnapshot {
  return {
    identity: createSmartPlaylistIdentity(detail.playlist.id, detail.playlist.name),
    tracks: detail.tracks,
    viewMode: detail.playlist.viewMode,
  }
}
