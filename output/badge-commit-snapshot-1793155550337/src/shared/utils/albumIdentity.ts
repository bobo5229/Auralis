import type { TrackListItem } from '@shared/types/libraryScan'

export const UNKNOWN_ALBUM_ARTIST = 'Unknown Artist'
export const UNKNOWN_ALBUM_TITLE = 'Unknown Album'

export function resolveAlbumArtist(track: Pick<TrackListItem, 'albumArtist' | 'artist'>): string {
  return track.albumArtist || track.artist || UNKNOWN_ALBUM_ARTIST
}

export function resolveAlbumTitle(track: Pick<TrackListItem, 'album'>): string {
  return track.album || UNKNOWN_ALBUM_TITLE
}

export function albumIdentityKey(albumArtist: string, title: string): string {
  return `${albumArtist}\u0000${title}`
}
