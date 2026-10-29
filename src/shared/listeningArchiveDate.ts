/** A local calendar date, without timezone conversion or permissive date parsing. */
export function isListeningArchiveDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1900 || year > 9999) return false
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value
}

/** The same local calendar day used when writing listening history. */
export function localListeningArchiveDate(playedAtIso: string): string {
  const date = new Date(playedAtIso)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}
