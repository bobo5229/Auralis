/** TTML keeps millisecond precision, including when only the performer is edited. */
export function formatTtmlEditorTime(seconds: number): string {
  const ms = Math.round(seconds * 1000)
  return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`
}

export function parseTtmlEditorTime(text: string): number | null {
  const match = /^(?:(\d+):)?(\d+):([0-5]\d)(?:\.(\d{1,3}))?$/.exec(text.trim())
  if (!match || (match[1] !== undefined && Number(match[2]) >= 60)) return null
  const ms =
    (Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000 +
    Number((match[4] ?? '').padEnd(3, '0'))
  return Number.isSafeInteger(ms) ? ms : null
}
