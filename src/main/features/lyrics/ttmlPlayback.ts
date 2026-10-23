import type { TtmlPlaybackLyrics } from '@shared/types/lyricsEditor'
import { readDuetLyrics } from './duetLyrics'
import { LyricsConversionError } from './conversionTypes'
import { parseTtmlForConversion } from './ttmlConversion'

/** Music TTML absolute timing, with stable paragraph identities; never round-trips through LRC. */
export function readTtmlPlayback(text: string): TtmlPlaybackLyrics {
  try {
    const snapshot = readDuetLyrics(text)
    const lines: TtmlPlaybackLyrics['lines'] = []
    parseTtmlForConversion(text, new Set(), { timingMode: 'absolute' }, (index, emitted) => {
      const source = snapshot.lines[index]
      if (!source) throw new Error('TTML paragraph mapping failed')
      for (const [part, line] of emitted.entries()) {
        lines.push({
          id: `${source.id}:${part}`,
          editorLineId: source.id,
          timeSeconds: line.startMs / 1000,
          endTimeSeconds: line.endMs === undefined ? null : line.endMs / 1000,
          text: line.text,
          performer:
            source.assignment === 'performer-1'
              ? 1
              : source.assignment === 'performer-2'
                ? 2
                : null,
        })
      }
    })
    // Stable sort retains independent same-time lines. Consumers should activate every overlapping line.
    lines.sort((a, b) => a.timeSeconds - b.timeSeconds)
    return { lines, error: null }
  } catch (error) {
    return {
      lines: [],
      error:
        error instanceof LyricsConversionError && error.code === 'unsupported-timing'
          ? 'unsupported-timing'
          : 'invalid-ttml',
    }
  }
}
