import type { DesktopLyricsPayload, DesktopLyricsStatus } from '@shared/types/desktopLyrics'
import type { LyricsStatus } from '../composables/useTrackLyrics'

export function getPlainLyricLines(rawLyrics: string | null): string[] {
  return (rawLyrics ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export interface BuildDesktopLyricsPayloadInput {
  track: { id: number; title: string | null; artist: string | null } | null
  isPlaying: boolean
  lyricsStatus: LyricsStatus
  rawLyrics: string | null
  parsedLines: readonly { id: string; text: string }[]
  activeIndex: number
  showPrelude: boolean
  preludeLitDotCount: number
  loadingText: string
  emptyText: string
  formatText: (value: string) => string
}

export function buildDesktopLyricsPayload(
  input: BuildDesktopLyricsPayloadInput,
): DesktopLyricsPayload {
  const {
    track,
    isPlaying,
    lyricsStatus,
    rawLyrics,
    parsedLines,
    activeIndex: inputActiveIndex,
    showPrelude,
    preludeLitDotCount,
    loadingText,
    emptyText,
    formatText,
  } = input

  const status: DesktopLyricsStatus = lyricsStatus === 'no-track' ? 'idle' : lyricsStatus

  if (!track) {
    return {
      trackId: null,
      title: null,
      artist: null,
      currentLine: '',
      nextLine: '',
      status: 'idle',
      isPlaying: false,
    }
  }

  let currentLine = ''
  let nextLine = ''

  if (lyricsStatus === 'loading') {
    currentLine = loadingText
  } else if (lyricsStatus === 'empty') {
    currentLine = emptyText
  } else if (lyricsStatus === 'plain') {
    const lines = getPlainLyricLines(rawLyrics)
    currentLine = lines[0] ?? emptyText
    nextLine = lines[1] ?? ''
  } else if (lyricsStatus === 'lrc') {
    const lines = parsedLines.filter((line) => line.text.length > 0)
    const activeIndex = lines.findIndex((line) => line.id === parsedLines[inputActiveIndex]?.id)

    if (activeIndex >= 0) {
      currentLine = lines[activeIndex]?.text ?? ''
      nextLine = lines[activeIndex + 1]?.text ?? ''
    } else {
      currentLine = showPrelude ? '.'.repeat(preludeLitDotCount) : ''
      nextLine = lines[0]?.text ?? ''
    }
  }

  return {
    trackId: track.id,
    title: track.title,
    artist: track.artist,
    currentLine: formatText(currentLine),
    nextLine: formatText(nextLine),
    status,
    isPlaying,
  }
}

export function getDesktopLyricsPayloadKey(payload: DesktopLyricsPayload): string {
  return [
    payload.trackId ?? '',
    payload.title ?? '',
    payload.artist ?? '',
    payload.currentLine,
    payload.nextLine,
    payload.status,
    payload.isPlaying ? '1' : '0',
  ].join('\0')
}
