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

export interface RgbColor {
  r: number
  g: number
  b: number
}

export interface OklabColor {
  l: number
  a: number
  b: number
}

export interface PaletteColor {
  rgb: RgbColor
  oklab: OklabColor
  weight: number
  chroma: number
}

export interface ArtworkPalette {
  key: string
  background: RgbColor
  accents: PaletteColor[]
  textTone: 'light' | 'dark'
  quality: 'full' | 'reduced' | 'fallback'
}
