import type { PlaybackTrack } from '../types'
import { formatArtist } from '@renderer/features/library/utils/formatArtist'
import { uiText } from '@renderer/i18n'

export function formatPlaybackSubtitle(track: PlaybackTrack, separator = '-'): string {
  const aa = formatArtist(track.albumArtist)
  const a = formatArtist(track.artist)
  const al = track.album

  if (aa && al) return `${aa} ${separator} ${al}`
  if (a && al) return `${a} ${separator} ${al}`
  if (aa) return aa
  if (a) return a
  if (al) return al
  return uiText('player.unknownArtist')
}
