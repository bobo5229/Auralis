import {
  LyricsConversionError,
  type ConversionDocument,
  type ConversionLine,
  type ConversionWarnings,
  type ConversionWord,
  type LrcToTtmlOptions,
} from './conversionTypes'
import { checkedMilliseconds, parseClockTime } from './conversionTime'
import { MAX_CONVERSION_ITEMS } from './ttmlDocument'
import { LRC_TIMESTAMP_SOURCE, parseLrcOffsetMilliseconds } from '@shared/utils/lrcTiming'

const STAMP = new RegExp(LRC_TIMESTAMP_SOURCE, 'y')
const INLINE_STAMP = /<(\d+):(\d{2})(?:[.:](\d{1,3}))?>/g

function timestamp(match: RegExpExecArray, warnings: ConversionWarnings): number {
  return parseClockTime(`${match[1]}:${match[2]}.${match[3] ?? '0'}`, warnings)
}

function enhancedWords(
  text: string,
  warnings: ConversionWarnings,
): { text: string; words?: ConversionWord[]; endMs?: number } {
  const marks = [...text.matchAll(INLINE_STAMP)]
  if (!marks.length) return { text }
  const words: ConversionWord[] = []
  let previous = -1
  const prefix = text.slice(0, marks[0].index)
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i]
    const startMs = timestamp(mark, warnings)
    if (startMs < previous)
      throw new LyricsConversionError('invalid-lrc', 'Word timestamps must be non-decreasing')
    previous = startMs
    const wordText = text.slice(mark.index! + mark[0].length, marks[i + 1]?.index ?? text.length)
    if (wordText) words.push({ startMs, text: wordText })
  }
  const last = marks.at(-1)!
  const endMs = last.index! + last[0].length === text.length ? timestamp(last, warnings) : undefined
  // Text before the first word mark remains visible from the line start.
  return { text: prefix + words.map((word) => word.text).join(''), words, endMs }
}

export function parseLrcForConversion(
  raw: string,
  warnings: ConversionWarnings,
  options: LrcToTtmlOptions,
): ConversionDocument {
  const lines: ConversionLine[] = []
  const metadata: Array<[string, string]> = []
  let offset = 0
  let taggedDuration: number | undefined
  let itemCount = 0
  for (const row of raw.replace(/^\uFEFF/, '').split(/\r?\n|\r/)) {
    const input = row.trimStart()
    if (!input.trim() || /^(#|\/\/)/.test(input)) continue
    const tag = /^\[([a-z][a-z\d_-]*):(.*)\]\s*$/i.exec(input)
    if (tag) {
      const key = tag[1].toLowerCase()
      const value = tag[2].trim()
      if (key === 'offset') {
        const parsed = parseLrcOffsetMilliseconds(value)
        if (parsed === null) {
          throw new LyricsConversionError('invalid-lrc', 'Invalid LRC offset')
        }
        // LRC compensation: positive values make lyrics appear earlier.
        offset = parsed
      } else {
        metadata.push([key, value])
        if (key === 'length') taggedDuration = parseClockTime(value, warnings)
      }
      continue
    }
    const times: number[] = []
    let cursor = 0
    while (true) {
      STAMP.lastIndex = cursor
      const match = STAMP.exec(input)
      if (!match) break
      times.push(timestamp(match, warnings))
      cursor = STAMP.lastIndex
    }
    if (!times.length) {
      if (/^\[\d/.test(input))
        throw new LyricsConversionError('invalid-lrc', 'Malformed LRC timestamp')
      warnings.add('untimed-lines-ignored')
      continue
    }
    const lyric = input.slice(cursor)
    if (/\[\d+:\d/.test(lyric))
      throw new LyricsConversionError(
        'invalid-lrc',
        'Interleaved square-bracket word timings are not supported; use enhanced LRC angle brackets',
      )
    const enhanced = enhancedWords(lyric, warnings)
    const prefix = lyric.slice(0, [...lyric.matchAll(INLINE_STAMP)][0]?.index ?? 0)
    itemCount +=
      times.length * (1 + (enhanced.words?.length ?? 0) + (enhanced.words && prefix ? 1 : 0))
    if (itemCount > MAX_CONVERSION_ITEMS)
      throw new LyricsConversionError(
        'invalid-input',
        'Expanded LRC exceeds the conversion item limit',
      )
    for (const time of times) {
      const delta = time - times[0]
      const words = enhanced.words?.map((word) => ({ ...word, startMs: word.startMs + delta }))
      if (words && prefix) words.unshift({ startMs: time, text: prefix })
      if (words?.some((word) => word.startMs < time))
        throw new LyricsConversionError('invalid-lrc', 'Word timestamp precedes its line')
      lines.push({
        startMs: time,
        text: enhanced.text,
        words,
        endMs: enhanced.endMs === undefined ? undefined : enhanced.endMs + delta,
      })
    }
  }
  if (!lines.length)
    throw new LyricsConversionError('invalid-lrc', 'No timestamped lyric lines found')
  const metadataItems = metadata.length + metadata.filter(([key]) => key === 'ti').length
  if (itemCount + metadataItems + 5 > MAX_CONVERSION_ITEMS) {
    throw new LyricsConversionError(
      'invalid-input',
      'Generated TTML exceeds the conversion item limit',
    )
  }
  function applyOffset(time: number): number {
    if (time - offset < 0) warnings.add('negative-times-clamped')
    return checkedMilliseconds(Math.max(0, time - offset))
  }
  for (const line of lines) {
    line.startMs = applyOffset(line.startMs)
    if (line.endMs !== undefined) line.endMs = applyOffset(line.endMs)
    line.words?.forEach((word) => {
      word.startMs = applyOffset(word.startMs)
    })
  }
  lines.sort((a, b) => a.startMs - b.startMs)
  const duration = options.durationMs ?? taggedDuration
  const finalDuration = options.finalLineDurationMs ?? 5000
  if (
    (duration !== undefined &&
      (!Number.isSafeInteger(duration) || duration <= lines.at(-1)!.startMs)) ||
    !Number.isSafeInteger(finalDuration) ||
    finalDuration <= 0
  ) {
    throw new LyricsConversionError(
      'invalid-option',
      'Duration must follow the final line; finalLineDurationMs must be a positive integer',
    )
  }
  // Group equal starts so translated/parallel lines receive the same next distinct end.
  let nextStart: number | undefined
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (i < lines.length - 1 && line.startMs < lines[i + 1].startMs)
      nextStart = lines[i + 1].startMs
    if (line.endMs === undefined) {
      warnings.add('inferred-line-ends')
      if (nextStart !== undefined) line.endMs = nextStart
      else if (duration !== undefined) line.endMs = duration
      else {
        line.endMs = checkedMilliseconds(line.startMs + finalDuration)
        warnings.add('inferred-final-end')
      }
    }
    if (line.endMs < line.startMs || (duration !== undefined && line.endMs > duration)) {
      throw new LyricsConversionError('invalid-lrc', 'Line end is outside its allowed interval')
    }
    const words = line.words ?? []
    for (let j = 0; j < words.length; j++) {
      words[j].endMs = words[j + 1]?.startMs ?? line.endMs
      if (words[j].endMs! > line.endMs || words[j].startMs > words[j].endMs!) {
        throw new LyricsConversionError('invalid-lrc', 'Word timing exceeds its line interval')
      }
    }
  }
  return { lines, metadata }
}
