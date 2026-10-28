import {
  LRC_TIMESTAMP_SOURCE,
  isLrcInlineTimingValid,
  lrcTimestampMilliseconds,
  readLrcOffsetMilliseconds,
  scanLrcInlineTiming,
  type LrcInlineTiming,
} from '@shared/utils/lrcTiming'

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
  enhanced: boolean
  timing: LrcInlineTiming
  timeMs: number | null
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
  const trimmedLine = line.trimStart()
  const timestamp = trimmedLine.match(LRC_TIMESTAMP)
  // Keep source coordinates so timing edits preserve a BOM or indentation.
  if (timestamp) timestamp.index = line.length - trimmedLine.length
  const multiple = (line.match(LRC_TIMESTAMPS)?.length ?? 0) > 1
  const timing = scanLrcInlineTiming(line)
  const enhanced = timing.timestamps.length > 0 || timing.malformed
  const timeMs = timestamp
    ? lrcTimestampMilliseconds(timestamp[1], timestamp[2], timestamp[3])
    : null
  return {
    start,
    end,
    number: text.slice(0, start).split('\n').length,
    text: line,
    timestamp,
    offsetMs: readLrcOffsetMilliseconds(text),
    timing,
    enhanced,
    timeMs,
    editable:
      !!line.trim() &&
      !multiple &&
      !/^\s*\[[a-z]+\s*:/i.test(line) &&
      (!timestamp || timeMs !== null) &&
      (!enhanced || (timeMs !== null && isLrcInlineTimingValid(timing, timeMs))) &&
      (!!timestamp || !/^\s*\[/.test(line)),
  }
}

export function replaceLrcLineTime(line: LrcTextLine, seconds: number): string | null {
  if (!line.editable || !Number.isFinite(seconds)) return null
  if (line.enhanced && line.timeMs !== null) {
    const targetMs = Math.round(seconds * 1000) + line.offsetMs
    return shiftEnhancedLine(line, targetMs - line.timeMs)
  }
  // Store the inverse compensation so playback triggers at the chosen time.
  const start = line.timestamp?.index ?? 0
  const end = start + (line.timestamp?.[0].length ?? 0)
  return `${line.text.slice(0, start)}[${formatLrcTime(seconds + line.offsetMs / 1000)}]${line.text.slice(end)}`
}

export function nudgeLrcLineTime(line: LrcTextLine, delta: number): string | null {
  const match = line.timestamp
  if (!match) return null
  if (line.enhanced) return shiftEnhancedLine(line, Math.round(delta * 1000))
  return replaceLrcLineTime(
    line,
    Number(match[1]) * 60 +
      Number(match[2]) +
      Number(`0.${match[3] ?? '0'}`) -
      line.offsetMs / 1000 +
      delta,
  )
}

function shiftEnhancedLine(line: LrcTextLine, deltaMs: number): string | null {
  if (!line.editable || !line.timestamp || line.timeMs === null || !Number.isSafeInteger(deltaMs))
    return null
  const markers = [
    {
      start: line.timestamp.index ?? 0,
      end: (line.timestamp.index ?? 0) + line.timestamp[0].length,
      timeMs: line.timeMs,
    },
    ...line.timing.timestamps,
  ]
  if (markers.some(({ timeMs }) => !Number.isSafeInteger(timeMs + deltaMs) || timeMs + deltaMs < 0))
    return null
  let text = line.text
  for (let index = markers.length - 1; index >= 0; index--) {
    const marker = markers[index]
    const time = marker.timeMs + deltaMs
    const clock = `${String(Math.floor(time / 60000)).padStart(2, '0')}:${String(Math.floor(time / 1000) % 60).padStart(2, '0')}.${String(time % 1000).padStart(3, '0')}`
    const label = index === 0 ? `[${clock}]` : `<${clock}>`
    text = text.slice(0, marker.start) + label + text.slice(marker.end)
  }
  return text
}
