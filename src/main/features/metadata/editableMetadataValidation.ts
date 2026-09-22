export function normalizeEditableText(value: string | null): string | null {
  if (value === null) {
    return null
  }

  const normalized = value.trim()
  return normalized || null
}

export function normalizeEditableYear(value: number | null): number | null {
  if (value === null) {
    return null
  }

  if (!Number.isInteger(value) || value < 0 || value > 9999) {
    throw new Error('Year must be a number from 0 to 9999')
  }

  return value
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
}

export function normalizeEditableReleaseDate(value: string | null): string | null {
  const normalized = normalizeEditableText(value)

  if (!normalized) {
    return null
  }

  const match = normalized.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/)

  if (!match) {
    throw new Error('Release Date must use YYYY, YYYY-MM, or YYYY-MM-DD')
  }

  const month = match[2] ? Number.parseInt(match[2], 10) : null
  const day = match[3] ? Number.parseInt(match[3], 10) : null

  if (month !== null && (month < 1 || month > 12)) {
    throw new Error('Release Date month must be between 01 and 12')
  }

  if (day !== null && (day < 1 || day > 31)) {
    throw new Error('Release Date day must be between 01 and 31')
  }

  // Validate that the date actually exists (e.g. reject 2025-02-31, 2025-04-31).
  // Manual days-in-month check avoids JS Date year 0–99 → 1900–1999 coercion.
  if (month !== null && day !== null) {
    const year = Number.parseInt(match[1], 10)
    if (day > daysInMonth(year, month)) {
      throw new Error('Release Date does not exist on the calendar')
    }
  }

  return normalized
}
