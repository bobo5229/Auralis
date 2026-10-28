import type { LyricLine, LyricSegment } from '../types'
import {
  LRC_TIMESTAMP_SOURCE,
  MAX_LRC_DOCUMENT_SEGMENTS,
  MAX_LRC_LINE_SEGMENTS,
  isLrcInlineTimingValid,
  lrcTimestampMilliseconds,
  readLrcOffsetMilliseconds,
  scanLrcInlineTiming,
  type LrcInlineTiming,
} from '@shared/utils/lrcTiming'

const LRC_LINE_TIME = new RegExp(`^${LRC_TIMESTAMP_SOURCE}`)

function adjustedSeconds(timeMs: number, offsetMs: number): number | null {
  const adjusted = timeMs - offsetMs
  return Number.isSafeInteger(adjusted) ? Math.max(0, adjusted) / 1000 : null
}

function parseSegments(
  text: string,
  timing: LrcInlineTiming,
  lineTimeMs: number,
  offsetMs: number,
): LyricSegment[] | undefined {
  if (!isLrcInlineTimingValid(timing, lineTimeMs)) return
  const segments: LyricSegment[] = []
  const markers = timing.timestamps
  const append = (content: string, startMs: number, endMs: number | null): boolean => {
    if (!content) return true
    const startTimeSeconds = adjustedSeconds(startMs, offsetMs)
    const endTimeSeconds = endMs === null ? null : adjustedSeconds(endMs, offsetMs)
    if (startTimeSeconds === null || (endMs !== null && endTimeSeconds === null)) return false
    segments.push({ text: content, startTimeSeconds, endTimeSeconds })
    return segments.length <= MAX_LRC_LINE_SEGMENTS
  }
  if (!append(text.slice(0, markers[0].start), lineTimeMs, markers[0].timeMs)) return
  for (let index = 0; index < markers.length; index++) {
    const marker = markers[index]
    const next = markers[index + 1]
    if (!append(text.slice(marker.end, next?.start), marker.timeMs, next?.timeMs ?? null)) return
  }
  return segments.length ? segments : undefined
}

export function parseLrc(raw: string): LyricLine[] {
  const lines: LyricLine[] = []
  const offset = readLrcOffsetMilliseconds(raw)
  let id = 0
  let segmentCount = 0

  for (const sourceLine of raw.split(/\r?\n|\r/)) {
    let remaining = sourceLine.trimStart()
    const timestamps: number[] = []
    while (remaining.length > 0) {
      const match = LRC_LINE_TIME.exec(remaining)
      if (!match) break
      const timeMs = lrcTimestampMilliseconds(match[1], match[2], match[3])
      if (timeMs === null) {
        timestamps.length = 0
        break
      }
      timestamps.push(timeMs)
      remaining = remaining.slice(match[0].length)
    }
    if (timestamps.length === 0) continue

    const timing = scanLrcInlineTiming(remaining)
    const enhanced = timing.timestamps.length > 0
    let segments =
      enhanced && timestamps.length === 1
        ? parseSegments(remaining, timing, timestamps[0], offset)
        : undefined
    if (segments) {
      if (segmentCount + segments.length > MAX_LRC_DOCUMENT_SEGMENTS) segments = undefined
      else segmentCount += segments.length
    }
    for (const timeMs of timestamps) {
      const timeSeconds = adjustedSeconds(timeMs, offset)
      if (timeSeconds === null) continue
      lines.push({
        id: String(id++),
        timeSeconds,
        text: enhanced ? timing.text : remaining.trim(),
        ...(enhanced ? { enhanced: true as const } : {}),
        ...(segments ? { segments } : {}),
      })
    }
  }

  lines.sort((a, b) => a.timeSeconds - b.timeSeconds)
  let nextStart = Infinity
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index]
    if (index + 1 < lines.length && lines[index + 1].timeSeconds > line.timeSeconds)
      nextStart = lines[index + 1].timeSeconds
    const segments = line.segments
    if (segments && segments[segments.length - 1].startTimeSeconds > nextStart) delete line.segments
  }
  return lines
}
