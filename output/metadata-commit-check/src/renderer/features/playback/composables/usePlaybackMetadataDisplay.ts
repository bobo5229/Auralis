import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'
import { formatPlaybackSubtitle } from '../utils/formatPlaybackSubtitle'
import type { PlaybackTrack } from '../types'

/** A temporary projection for the existing subtitle formatter, never stored in playback state. */
export function usePlaybackMetadataDisplay() {
  const { songText, songValues } = useChineseTextDisplay()
  return {
    songText,
    songValues,
    playbackSubtitle: (track: PlaybackTrack, separator = '-') =>
      formatPlaybackSubtitle(
        {
          ...track,
          artist: songValues(track.artist),
          albumArtist: songValues(track.albumArtist),
          album: songText(track.album),
        },
        separator,
      ),
  }
}
