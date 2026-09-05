export type DesktopLyricsStatus = 'idle' | 'loading' | 'empty' | 'plain' | 'lrc'

export interface DesktopLyricsPayload {
  trackId: number | null
  title: string | null
  artist: string | null
  currentLine: string
  nextLine: string
  status: DesktopLyricsStatus
  isPlaying: boolean
}
