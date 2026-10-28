import { resolveAlbumArtist } from '@shared/utils/albumIdentity'
import type { PlaybackTrack } from '../types'

/** Album identity shared by queue planning and seamless boundary decisions. */
export function getAlbumIdentity(track: PlaybackTrack): string | null {
  const album = track.album?.trim()
  if (!album) return null
  const albumArtist = resolveAlbumArtist(track).trim()
  return `${albumArtist.toLocaleLowerCase()}\u0000${album.toLocaleLowerCase()}`
}
