export interface PlaybackTrack {
  id: number
  title: string | null
  artist: string | null
  album: string | null
  albumArtist: string | null
  durationSeconds: number | null
  artworkCacheKey: string | null
}

export interface PlaybackState {
  queue: PlaybackTrack[]
  currentIndex: number
  currentTrack: PlaybackTrack | null
  selectedTrackId: number | null
  currentTrackId: number | null
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  error: string | null
}
