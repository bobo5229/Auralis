import {
  LyricsConversionError,
  type ConversionWarnings,
  type LrcToTtmlOptions,
  type LyricsConversionResult,
  type TtmlToLrcOptions,
} from './conversionTypes'
import { formatLrcTime } from './conversionTime'
import { parseLrcForConversion } from './lrcConversion'
import { parseTtmlForConversion, serializeConversionTtml } from './ttmlConversion'
import { hasInvalidXmlCharacters, MAX_LYRICS_CHARACTERS } from './ttmlDocument'

export { LyricsConversionError } from './conversionTypes'
export type {
  LrcToTtmlOptions,
  TtmlToLrcOptions,
  LyricsConversionResult,
  LyricsConversionWarning,
} from './conversionTypes'

function validateInput(text: string): void {
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_LYRICS_CHARACTERS) {
    throw new LyricsConversionError(
      'invalid-input',
      'Expected non-empty lyrics within the input size limit',
    )
  }
  if (hasInvalidXmlCharacters(text)) {
    throw new LyricsConversionError(
      'invalid-input',
      'Lyrics contain characters that cannot be represented in XML 1.0',
    )
  }
}

/** Pure conversion only: does not read/write files, update the library or replace the source. */
export function convertLrcToTtml(
  text: string,
  options: LrcToTtmlOptions = {},
): LyricsConversionResult {
  validateInput(text)
  const warnings: ConversionWarnings = new Set()
  const source = parseLrcForConversion(text, warnings, options)
  const output = serializeConversionTtml(source)
  validateInput(output)
  return { text: output, format: 'ttml', warnings: [...warnings] }
}

/** Exports basic millisecond LRC. Rich TTML semantics are reported in warnings. */
export function convertTtmlToLrc(
  text: string,
  options: TtmlToLrcOptions = {},
): LyricsConversionResult {
  validateInput(text)
  const warnings: ConversionWarnings = new Set()
  const source = parseTtmlForConversion(text, warnings, options)
  const rows = source.metadata.map(([key, value]) => `[${key}:${value.replace(/[\r\n]+/g, ' ')}]`)
  for (const line of source.lines) {
    for (const content of line.text.split(/\r?\n|\r/)) {
      rows.push(`[${formatLrcTime(line.startMs)}]${content}`)
    }
  }
  const output = `${rows.join('\n')}\n`
  validateInput(output)
  return { text: output, format: 'lrc', warnings: [...warnings] }
}
