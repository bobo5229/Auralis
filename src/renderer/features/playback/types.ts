export interface PlaybackTrack {
  id: number
  title: string | null
  artist: string | null
  album: string | null
  albumArtist: string | null
  durationSeconds: number | null
  artworkCacheKey: string | null
}

export type PlaybackMode = 'sequential' | 'repeat-all' | 'repeat-one' | 'shuffle' | 'album-shuffle'

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
import type { RgbColor } from '@renderer/shared/color/types'
import type { ArtworkColor } from '@renderer/shared/artwork/artworkAnalysis'

export interface PaletteColor extends ArtworkColor {
  /** Extracted cluster color before display tone mapping. */
  sourceRgb?: RgbColor
}

export interface ArtworkPalette {
  key: string
  /** Representative source color selected by area-led scoring, before display tone mapping. */
  dominant?: RgbColor
  background: RgbColor
  accents: PaletteColor[]
  textTone: 'light' | 'dark'
  quality: 'full' | 'reduced' | 'fallback'
}
