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
