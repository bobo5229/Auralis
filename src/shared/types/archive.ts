export interface ListeningHeatmapDay {
  date: string
  playCount: number
  durationSeconds: number
}

export interface ListeningHeatmap {
  year: number
  firstRecordedYear: number | null
  days: ListeningHeatmapDay[]
}

export interface DailyTopTrack {
  trackId: number
  title: string | null
  artist: string | null
  album: string | null
  artworkCacheKey: string | null
  playCount: number
  durationSeconds: number
}

export interface DailyListeningDetail {
  date: string
  totalPlayCount: number
  totalDurationSeconds: number
  tracks: DailyTopTrack[]
}

export interface AnnualListeningInsights {
  year: number
  topTrack: DailyTopTrack | null
  peakDay: {
    date: string
    uniqueTrackCount: number
    topTracks: DailyTopTrack[]
  } | null
}

export type ListeningRankingRange = 'day' | 'week' | 'month' | 'year'

export type ListeningRankingTarget = 'track' | 'album'

export interface ListeningRankingParams {
  range: ListeningRankingRange
  target: ListeningRankingTarget
  date?: string
  weekStartDate?: string
  year?: number
  month?: number
}

export interface ListeningRankingItem {
  key: string
  title: string | null
  artist: string | null
  artworkCacheKey: string | null
  playCount: number
  durationSeconds: number
}

export interface ListeningRanking {
  range: ListeningRankingRange
  target: ListeningRankingTarget
  startDate: string
  endDate: string
  items: ListeningRankingItem[]
}

export interface GenreSpectrumItem {
  genre: string
  count: number
  durationSeconds: number
  /** 0.0 ~ 1.0 占比（按播放时长） */
  ratio: number
  /** 前端光谱/环形图主色 */
  colorHex: string
  /** 该流派在当年按播放次数 Top N（默认 3，可不足） */
  topTracks?: DailyTopTrack[]
}

export interface ListeningGenreSpectrum {
  year: number
  totalPlayedTracks: number
  totalDurationSeconds: number
  items: GenreSpectrumItem[]
}
