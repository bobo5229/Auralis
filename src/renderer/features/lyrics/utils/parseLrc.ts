import type { LyricLine } from '../types'

const LRC_LINE = /^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\](.*)$/

const META_TAGS = /^(ar|ti|al|by|offset|length)$/i

export function parseLrc(raw: string): LyricLine[] {
  const lines: LyricLine[] = []
  let id = 0

  for (const line of raw.split('\n')) {
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
      timestamps.push(minutes * 60 + seconds + millis / 1000)
      remaining = match[4]
    }

    // Skip metadata lines (ar, ti, al, etc.)
    if (timestamps.length === 0 && META_TAGS.test(text)) continue

    // Skip lines with no timestamps
    if (timestamps.length === 0) continue

    for (const timeSeconds of timestamps) {
      lines.push({ id: String(id++), timeSeconds, text: text.trim() })
    }
  }

  lines.sort((a, b) => a.timeSeconds - b.timeSeconds)
  return lines
}
