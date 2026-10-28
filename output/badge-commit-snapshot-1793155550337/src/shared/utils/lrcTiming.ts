/** LRC minutes can exceed two digits on long recordings. Captures minutes, seconds and fraction. */
export const LRC_TIMESTAMP_SOURCE = String.raw`\[(\d+):([0-5]\d)(?:[.:](\d{1,3}))?\]`

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
