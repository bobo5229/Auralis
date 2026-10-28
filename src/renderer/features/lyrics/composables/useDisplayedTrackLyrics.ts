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
      source.parsedLines.value.map((line) => {
        const text = lyricText(line.text)
        if (!line.segments) return { ...line, text }
        const segments = line.segments.map((segment) => ({
          ...segment,
          text: lyricText(segment.text),
        }))
        // Phrase conversion can cross a timing boundary; keep the existing whole-line wording.
        return {
          ...line,
          text,
          segments:
            segments.map((segment) => segment.text).join('') === text ? segments : undefined,
        }
      }),
    ),
  }
}
