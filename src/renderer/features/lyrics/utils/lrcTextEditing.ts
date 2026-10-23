import { LRC_TIMESTAMP_SOURCE, readLrcOffsetMilliseconds } from '@shared/utils/lrcTiming'

const LRC_TIMESTAMP = new RegExp(`^${LRC_TIMESTAMP_SOURCE}`)
const LRC_TIMESTAMPS = new RegExp(LRC_TIMESTAMP_SOURCE, 'g')

export interface LrcTextLine {
  start: number
  end: number
  number: number
  text: string
  timestamp: RegExpMatchArray | null
  offsetMs: number
  editable: boolean
}

export function formatLrcTime(seconds: number): string {
  const total = Math.max(0, Math.round((Number.isFinite(seconds) ? seconds : 0) * 100))
  return `${String(Math.floor(total / 6000)).padStart(2, '0')}:${String(Math.floor(total / 100) % 60).padStart(2, '0')}.${String(total % 100).padStart(2, '0')}`
}

export function getLrcTextLine(text: string, cursor: number): LrcTextLine {
  cursor = Math.max(0, Math.min(text.length, cursor))
  const start = cursor === 0 ? 0 : text.lastIndexOf('\n', cursor - 1) + 1
  const next = text.indexOf('\n', cursor)
  const end = next < 0 ? text.length : next
  const line = text.slice(start, end)
  const timestamp = line.match(LRC_TIMESTAMP)
  const multiple = (line.match(LRC_TIMESTAMPS)?.length ?? 0) > 1
  return {
    start,
    end,
    number: text.slice(0, start).split('\n').length,
    text: line,
    timestamp,
    offsetMs: readLrcOffsetMilliseconds(text),
    editable:
      !!line.trim() &&
      !multiple &&
      !/^\s*\[[a-z]+\s*:/i.test(line) &&
      (!!timestamp || !/^\s*\[/.test(line)),
  }
}

export function replaceLrcLineTime(line: LrcTextLine, seconds: number): string | null {
  if (!line.editable || !Number.isFinite(seconds)) return null
  // Store the inverse compensation so playback and TTML export trigger at the chosen time.
  return `[${formatLrcTime(seconds + line.offsetMs / 1000)}]${line.timestamp ? line.text.slice(line.timestamp[0].length) : line.text}`
}

export function nudgeLrcLineTime(line: LrcTextLine, delta: number): string | null {
  const match = line.timestamp
  if (!match) return null
  return replaceLrcLineTime(
    line,
    Number(match[1]) * 60 +
      Number(match[2]) +
      Number(`0.${match[3] ?? '0'}`) -
      line.offsetMs / 1000 +
      delta,
  )
}
