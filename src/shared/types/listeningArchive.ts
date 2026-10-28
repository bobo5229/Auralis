import type { PlaybackTrackDto } from './playback'

export interface DailyPlayCount {
  date: string
  playCount: number
  durationSeconds: number
}

export interface AnnualAlbum extends DailyTopAlbum {
  key: string
  firstPlayedDate: string
  monthlyPlays: number[]
  available: boolean
}

export interface AnnualTrack {
  key: string
  title: string | null
  artist: string | null
  album: string | null
  artworkCacheKey: string | null
  playCount: number
  /** Historical and missing tracks remain visible, but cannot be played. */
  playback: PlaybackTrackDto | null
}

export interface AnnualArtist {
  name: string
  playCount: number
  albums: AnnualAlbum[]
}

export interface AnnualSummary {
  year: number
  playCount: number
  activeDays: number
  albumCount: number
  albums: AnnualAlbum[]
  tracks: AnnualTrack[]
  artists: AnnualArtist[]
  months: { month: number; playCount: number; albums: AnnualAlbum[] }[]
  /** Spring, summer, autumn, winter. Winter comprises January, February and December. */
  seasons: { months: number[]; album: AnnualAlbum | null }[]
  peakDay: { date: string; playCount: number; album: DailyTopAlbum | null } | null
  longestRun: { start: string; end: string; days: number } | null
  selection: PlaybackTrackDto[]
}

export interface DailyTopTrack {
  artworkCacheKey: string | null
  trackId: number
  title: string | null
  artist: string | null
  playCount: number
}

export interface DailyTopAlbum {
  album: string
  albumArtist: string | null
  artworkCacheKey: string | null
  playCount: number
  durationSeconds: number
  trackCount: number
}
