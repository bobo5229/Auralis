export interface AnnualCalendar {
  weeks: (string | null)[][]
  months: { month: number; column: number }[]
}

/** Calendar arithmetic uses UTC so local DST changes cannot skip or repeat a day. */
export function createAnnualCalendar(year: number): AnnualCalendar {
  const date = new Date(0)
  date.setUTCFullYear(year, 0, 1)
  date.setUTCHours(0, 0, 0, 0)
  const offset = (date.getUTCDay() + 6) % 7
  const cells: (string | null)[] = Array.from({ length: offset }, () => null)
  const months: AnnualCalendar['months'] = []

  while (date.getUTCFullYear() === year) {
    if (date.getUTCDate() === 1) {
      months.push({ month: date.getUTCMonth(), column: Math.floor(cells.length / 7) })
    }
    cells.push(date.toISOString().slice(0, 10))
    date.setUTCDate(date.getUTCDate() + 1)
  }

  while (cells.length % 7 !== 0) cells.push(null)
  const weeks = Array.from({ length: cells.length / 7 }, (_, column) =>
    cells.slice(column * 7, column * 7 + 7),
  )
  return { weeks, months }
}
