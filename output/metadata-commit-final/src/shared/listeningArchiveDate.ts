/** A local calendar date, without timezone conversion or permissive date parsing. */
export function isListeningArchiveDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1900 || year > 9999) return false
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value
}
