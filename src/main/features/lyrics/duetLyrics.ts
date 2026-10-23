import { readDuetDocument } from './duetDocument'
import type { DuetLyricsSnapshot } from './duetTypes'

export { DuetLyricsError } from './duetTypes'

/** Read performer annotations for playback without modifying the document. */
export function readDuetLyrics(text: string): DuetLyricsSnapshot {
  return readDuetDocument(text).snapshot
}
