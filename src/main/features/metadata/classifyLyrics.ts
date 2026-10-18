import { parseTtmlDocument } from '../lyrics/ttmlDocument'
import type { LyricsFormat } from '@shared/types/libraryScan'
import { LRC_TIMESTAMP_SOURCE } from '@shared/utils/lrcTiming'

export interface ResolvedLyrics {
  text: string
  format: LyricsFormat
}

const LRC_TIMESTAMP = new RegExp(LRC_TIMESTAMP_SOURCE)
const TTML_ROOT = /<(?:[\w.-]+:)?tt(?=[\s>])/u

/** Structural recognition only; timing and presentation are decoded by the consumer. */
function isTtml(text: string): boolean {
  try {
    parseTtmlDocument(text)
    return true
  } catch {
    return false
  }
}

export function classifyLyrics(text: string, requireTtml = false): ResolvedLyrics | null {
  const normalized = text.replace(/^\uFEFF/, '').trim()
  if (!normalized) return null
  if (requireTtml || TTML_ROOT.test(normalized)) {
    // Keep the original XML, including whitespace, extensions and artist metadata.
    return isTtml(normalized) ? { text, format: 'ttml' } : null
  }
  return { text: normalized, format: LRC_TIMESTAMP.test(normalized) ? 'lrc' : 'plain' }
}
