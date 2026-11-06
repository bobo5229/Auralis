export interface PlaybackTrack {
  id: number
  title: string | null
  artist: string | null
  album: string | null
  albumArtist: string | null
  durationSeconds: number | null
  artworkCacheKey: string | null
}

export type { PlaybackMode } from '@shared/types/playback'
import type { PlaybackMode } from '@shared/types/playback'

export interface ShuffleCycle {
  remaining: number[]
  seed: number
}

export type AlbumShuffleContext = {
  albumArtist: string
  album: string
  tracks: PlaybackTrack[]
} | null

export interface PlaybackState {
  queue: PlaybackTrack[]
  currentIndex: number
  currentTrack: PlaybackTrack | null
  selectedTrackId: number | null
  currentTrackId: number | null
  playbackMode: PlaybackMode
  isPlaying: boolean
  isMuted: boolean
  currentTime: number
  duration: number
  volume: number
  error: string | null
}

export type { RgbColor, OklabColor } from '@renderer/shared/color/types'
export type { ArtworkPalette, PaletteColor } from '@renderer/shared/artwork/types'
