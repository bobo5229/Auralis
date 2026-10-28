/** Validate the stored date precision without relying on Date's year 0–99 coercion. */
export function normalizeReleaseDate(value: string | null): string | null {
  const normalized = value?.trim() || null
  if (!normalized) return null
  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(normalized)
  if (!match) throw new Error('Release Date must use YYYY, YYYY-MM, or YYYY-MM-DD')
  const year = Number(match[1])
  const month = match[2] ? Number(match[2]) : null
  const day = match[3] ? Number(match[3]) : null
  if (month !== null && (month < 1 || month > 12))
    throw new Error('Release Date month must be between 01 and 12')
  if (day !== null && (day < 1 || day > 31))
    throw new Error('Release Date day must be between 01 and 31')
  if (month !== null && day !== null) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!
    if (day > days) throw new Error('Release Date does not exist on the calendar')
  }
  return normalized
}

export function releaseDateYear(date: string | null): number | null {
  return date === null ? null : Number(date.slice(0, 4))
}
