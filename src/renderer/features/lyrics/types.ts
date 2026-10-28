export interface LyricSegment {
  text: string
  startTimeSeconds: number
  endTimeSeconds: number | null
}

export interface LyricLine {
  id: string
  timeSeconds: number
  text: string
  /** Preserve source whitespace even when ambiguous timing falls back to a whole line. */
  enhanced?: true
  segments?: readonly LyricSegment[]
}
