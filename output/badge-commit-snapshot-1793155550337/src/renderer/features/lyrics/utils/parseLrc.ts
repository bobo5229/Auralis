import type { LyricLine } from '../types'
import { LRC_TIMESTAMP_SOURCE, readLrcOffsetMilliseconds } from '@shared/utils/lrcTiming'

const LRC_LINE = new RegExp(`^${LRC_TIMESTAMP_SOURCE}(.*)$`)

export function parseLrc(raw: string): LyricLine[] {
  const lines: LyricLine[] = []
  const offset = readLrcOffsetMilliseconds(raw)
  let id = 0

  for (const line of raw.split(/\r?\n|\r/)) {
    const trimmed = line.trim()

    // Collect all timestamps on one line
    const timestamps: number[] = []
    let text = ''
    let remaining = trimmed

    while (remaining.length > 0) {
      const match = remaining.match(LRC_LINE)
      if (!match) {
        text = remaining
        break
      }

      const [, min, sec, ms] = match
      const minutes = Number.parseInt(min, 10)
      const seconds = Number.parseInt(sec, 10)
      const millis = ms ? Number.parseInt(ms.padEnd(3, '0'), 10) : 0
      const timeMs = (minutes * 60 + seconds) * 1000 + millis
      if (!Number.isSafeInteger(timeMs)) {
        timestamps.length = 0
        break
      }
      timestamps.push(timeMs)
      remaining = match[4]
    }

    // Skip metadata and plain text lines with no timestamps.
    if (timestamps.length === 0) continue

    for (const timeMs of timestamps) {
      const adjusted = Math.max(0, timeMs - offset)
      if (!Number.isSafeInteger(adjusted)) continue
      lines.push({ id: String(id++), timeSeconds: adjusted / 1000, text: text.trim() })
    }
  }

  lines.sort((a, b) => a.timeSeconds - b.timeSeconds)
  return lines
}
