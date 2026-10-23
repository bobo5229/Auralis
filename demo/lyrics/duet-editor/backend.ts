import {
  assignDuetLines,
  configureDuetPerformers,
  readDuetLyrics,
} from '../../../src/main/features/lyrics/duetLyrics'
import { DuetLyricsError } from '../../../src/main/features/lyrics/duetTypes'
import {
  convertLrcToTtml,
  convertTtmlToLrc,
} from '../../../src/main/features/lyrics/lyricsConversion'
import { MAX_LYRICS_CHARACTERS } from '../../../src/main/features/lyrics/ttmlDocument'
import type { DemoRequest, DemoResponse } from './contract'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Runtime validation is required even on this loopback-only demo transport. */
export function handleDemoRequest(value: unknown): DemoResponse {
  if (
    !record(value) ||
    typeof value.text !== 'string' ||
    !value.text.trim() ||
    value.text.length > MAX_LYRICS_CHARACTERS ||
    !['open', 'configure', 'assign', 'export'].includes(String(value.action)) ||
    ((value.action === 'open' || value.action === 'export') &&
      value.format !== 'lrc' &&
      value.format !== 'ttml') ||
    ((value.action === 'configure' || value.action === 'assign') && !record(value.request))
  ) {
    throw new DuetLyricsError('invalid-request', 'Invalid demo request')
  }
  // Editing functions validate nested fields, IDs, names, revisions and batch sizes.
  const input = value as DemoRequest
  if (input.action === 'open') {
    const converted = input.format === 'lrc' ? convertLrcToTtml(input.text) : null
    const text = converted?.text ?? input.text
    return { text, snapshot: readDuetLyrics(text), warnings: converted?.warnings ?? [] }
  }
  if (input.action === 'export') {
    const snapshot = readDuetLyrics(input.text)
    const converted = input.format === 'lrc' ? convertTtmlToLrc(input.text) : null
    return { text: converted?.text ?? input.text, snapshot, warnings: converted?.warnings ?? [] }
  }
  const edited =
    input.action === 'configure'
      ? configureDuetPerformers(input.text, input.request)
      : assignDuetLines(input.text, input.request)
  return { text: edited.text, snapshot: edited.snapshot, warnings: [] }
}
