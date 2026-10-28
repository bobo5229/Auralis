import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import type { LyricLine } from '../types'

export function useLyricLineSeek(options: {
  lines: () => readonly LyricLine[]
  enabled?: () => boolean
  onSeek: () => void
}) {
  const { seekTo } = usePlayback()

  function activate(index: number): void {
    if (options.enabled && !options.enabled()) return
    const line = options.lines()[index]
    if (!line || !Number.isFinite(line.timeSeconds)) return
    seekTo(line.timeSeconds)
    options.onSeek()
  }

  function onKeydown(event: KeyboardEvent, index: number): void {
    if (options.enabled && !options.enabled()) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    event.stopPropagation()
    activate(index)
  }

  return { activate, onKeydown }
}
