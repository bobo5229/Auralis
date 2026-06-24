import type { PlaybackTrack } from '../types'

export function formatPlaybackSubtitle(track: PlaybackTrack): string {
  const aa = track.albumArtist
  const a = track.artist
  const al = track.album

  if (aa && al) return `${aa} - ${al}`
  if (a && al) return `${a} - ${al}`
  if (aa) return aa
  if (a) return a
  if (al) return al
  return 'Unknown Artist'
}
