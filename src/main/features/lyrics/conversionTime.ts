import { LyricsConversionError, type ConversionWarnings } from './conversionTypes'

export function checkedMilliseconds(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new LyricsConversionError(
      'unsupported-timing',
      'Time must be a non-negative safe integer in milliseconds',
    )
  }
  return value
}

export function parseClockTime(text: string, warnings: ConversionWarnings): number {
  const parts = text.trim().split(':')
  if (
    parts.length < 2 ||
    parts.length > 3 ||
    !parts.every((part) => /^\d+(?:\.\d+)?$/.test(part))
  ) {
    throw new LyricsConversionError('unsupported-timing', `Unsupported clock time: ${text}`)
  }
  const seconds = Number(parts.pop())
  const minutes = Number(parts.pop())
  const hours = parts.length ? Number(parts[0]) : 0
  if (
    !Number.isInteger(minutes) ||
    !Number.isInteger(hours) ||
    seconds >= 60 ||
    (parts.length && minutes >= 60)
  ) {
    throw new LyricsConversionError('unsupported-timing', `Invalid clock time: ${text}`)
  }
  return roundedMilliseconds((hours * 3600 + minutes * 60 + seconds) * 1000, warnings)
}

function roundedMilliseconds(value: number, warnings: ConversionWarnings): number {
  const rounded = Math.round(value)
  if (Math.abs(value - rounded) > 0.000001) warnings.add('submillisecond-times-rounded')
  return checkedMilliseconds(rounded)
}

export function parseTtmlTime(text: string, warnings: ConversionWarnings): number {
  if (text.includes(':')) return parseClockTime(text, warnings)
  const offset = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(text.trim())
  if (!offset)
    throw new LyricsConversionError('unsupported-timing', `Unsupported TTML time: ${text}`)
  const units: Record<string, number> = { ms: 1, s: 1000, m: 60000, h: 3600000 }
  return roundedMilliseconds(Number(offset[1]) * units[offset[2]], warnings)
}
