export interface LyricLine {
  id: string
  timeSeconds: number
  text: string
  performer?: 1 | 2 | null
}
