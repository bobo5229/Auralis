export interface DailyPlayCount {
  date: string
  playCount: number
  durationSeconds: number
}

export interface DailyTopTrack {
  trackId: number
  title: string | null
  artist: string | null
  playCount: number
}
