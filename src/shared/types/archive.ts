export interface ListeningHeatmapDay {
  date: string
  playCount: number
}

export interface ListeningHeatmap {
  year: number
  firstRecordedYear: number | null
  days: ListeningHeatmapDay[]
}
