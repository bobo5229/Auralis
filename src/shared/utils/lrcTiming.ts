/** LRC minutes can exceed two digits on long recordings. Captures minutes, seconds and fraction. */
export const LRC_TIMESTAMP_SOURCE = String.raw`\[(\d+):([0-5]\d)(?:[.:](\d{1,3}))?\]`

const LRC_CLOCK = /^(\d+):([0-5]\d)(?:[.:](\d{1,3}))?$/
export const MAX_LRC_LINE_SEGMENTS = 1024
export const MAX_LRC_DOCUMENT_SEGMENTS = 16384

export function lrcTimestampMilliseconds(
  minutes: string,
  seconds: string,
  fraction = '',
): number | null {
  const value = (Number(minutes) * 60 + Number(seconds)) * 1000 + Number(fraction.padEnd(3, '0'))
  return Number.isSafeInteger(value) ? value : null
}

export interface LrcInlineTimestamp {
  start: number
  end: number
  timeMs: number
}

export interface LrcInlineTiming {
  text: string
  timestamps: LrcInlineTimestamp[]
  malformed: boolean
  overflow: boolean
}

/** Scan only complete A2 clock tags; literal angle brackets remain text, never HTML. */
export function scanLrcInlineTiming(text: string): LrcInlineTiming {
  const timestamps: LrcInlineTimestamp[] = []
  const parts: string[] = []
  let cursor = 0
  let count = 0
  let malformed = false
  for (const match of text.matchAll(/<([^<>\r\n]*)(>|(?=<)|$)/g)) {
    const clock = match[2] === '>' ? LRC_CLOCK.exec(match[1]) : null
    const timeMs = clock ? lrcTimestampMilliseconds(clock[1], clock[2], clock[3]) : null
    if (timeMs === null) {
      if (/^\s*[+-]?\d+\s*[:：]/.test(match[1])) malformed = true
      continue
    }
    parts.push(text.slice(cursor, match.index))
    cursor = match.index + match[0].length
    count++
    // One extra marker is allowed for the final end boundary.
    if (count <= MAX_LRC_LINE_SEGMENTS + 1)
      timestamps.push({ start: match.index, end: cursor, timeMs })
  }
  parts.push(text.slice(cursor))
  return {
    text: parts.join(''),
    timestamps,
    malformed,
    overflow: count > MAX_LRC_LINE_SEGMENTS + 1,
  }
}

export function isLrcInlineTimingValid(timing: LrcInlineTiming, lineTimeMs: number): boolean {
  if (timing.malformed || timing.overflow || timing.timestamps.length === 0) return false
  let previous = lineTimeMs
  for (const marker of timing.timestamps) {
    if (marker.timeMs < previous) return false
    previous = marker.timeMs
  }
  return true
}

export function parseLrcOffsetMilliseconds(value: string): number | null {
  const normalized = value.trim()
  if (!/^[+-]?\d+$/.test(normalized)) return null
  const offset = Number(normalized)
  return Number.isSafeInteger(offset) ? offset : null
}

/** Positive compensation makes lyrics appear earlier; the last valid tag applies to all lines. */
export function readLrcOffsetMilliseconds(raw: string): number {
  let offset = 0
  for (const line of raw.split(/\r?\n|\r/)) {
    const match = /^\[offset:(.*)\]$/i.exec(line.trim())
    if (!match) continue
    const parsed = parseLrcOffsetMilliseconds(match[1])
    if (parsed !== null) offset = parsed
  }
  return offset
}
