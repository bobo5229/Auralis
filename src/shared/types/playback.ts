export interface PlaybackTrackDto {
  id: number
  title: string | null
  artist: string | null
  album: string | null
  albumArtist: string | null
  durationSeconds: number | null
  artworkCacheKey: string | null
}

export interface RandomAlbumTracksResult {
  albumArtist: string
  album: string
  tracks: PlaybackTrackDto[]
}
