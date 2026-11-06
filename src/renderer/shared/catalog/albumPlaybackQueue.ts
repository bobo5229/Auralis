import type { TrackListItem } from '@shared/types/libraryScan'
import type { PlaybackMode } from '@shared/types/playback'
import { getAlbumCatalogIndex } from '@renderer/shared/catalog/albumCatalogIndex'
import { albumIdentityKey } from '@shared/utils/albumIdentity'

export function buildAlbumPlaybackQueue(
  tracks: readonly TrackListItem[],
  albumArtist: string,
  albumTitle: string,
  mode: PlaybackMode,
): TrackListItem[] {
  const index = getAlbumCatalogIndex(tracks)
  const currentTracks = index.selectTracks(albumArtist, albumTitle)
  if (mode !== 'sequential') return [...currentTracks]

  const key = albumIdentityKey(albumArtist, albumTitle)
  const albumIndex = index.albums.findIndex((album) => album.key === key)
  if (albumIndex < 0) return [...currentTracks]

  return index.albums
    .slice(albumIndex)
    .flatMap((album) => index.selectTracks(album.albumArtist, album.title))
}
