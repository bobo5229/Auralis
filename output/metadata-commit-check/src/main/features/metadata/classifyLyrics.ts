import type { LyricsFormat } from '@shared/types/libraryScan'
import { LRC_TIMESTAMP_SOURCE } from '@shared/utils/lrcTiming'

export interface ResolvedLyrics {
  text: string
  format: LyricsFormat
}

const LRC_TIMESTAMP = new RegExp(LRC_TIMESTAMP_SOURCE)
const TTML_ROOT = /<(?:[\w.-]+:)?tt(?=[\s>])/u

/** Recognize embedded TTML without parsing or displaying it. */
export function isTtmlLike(text: string): boolean {
  return TTML_ROOT.test(text)
}

export function classifyLyrics(text: string): ResolvedLyrics | null {
  const normalized = text.replace(/^\uFEFF/, '').trim()
  if (!normalized || isTtmlLike(normalized)) return null
  return { text: normalized, format: LRC_TIMESTAMP.test(normalized) ? 'lrc' : 'plain' }
}
