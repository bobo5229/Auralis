import { computed } from 'vue'
import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'
import { useTrackLyrics } from './useTrackLyrics'

/** Opt-in display projection; the CD room continues consuming original lyrics. */
export function useDisplayedTrackLyrics() {
  const source = useTrackLyrics()
  const { lyricText } = useChineseTextDisplay()
  return {
    ...source,
    rawLyrics: computed(() =>
      source.rawLyrics.value === null ? null : lyricText(source.rawLyrics.value),
    ),
    parsedLines: computed(() =>
      source.parsedLines.value.map((line) => ({ ...line, text: lyricText(line.text) })),
    ),
  }
}
