/** One row per recorded track/month, streamed from the date-filtered history query. */
export interface AnnualListeningRow {
  source: 'library' | 'removed'
  trackId: number
  month: number
  firstPlayedDate: string
  title: string | null
  artist: string | null
  album: string | null
  albumArtist: string | null
  artworkCacheKey: string | null
  durationSeconds: number | null
  available: number
  playCount: number
  recordedDuration: number
}
