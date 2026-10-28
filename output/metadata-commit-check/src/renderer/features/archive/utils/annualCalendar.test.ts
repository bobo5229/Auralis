import { describe, expect, it } from 'vitest'
import { createAnnualCalendar } from './annualCalendar'

describe('annual calendar', () => {
  it.each([
    [2026, 365],
    [2024, 366],
    [2000, 366],
    [2100, 365],
  ])('covers every date exactly once in %i', (year, days) => {
    const { weeks, months } = createAnnualCalendar(year)
    const dates = weeks.flat().filter((date): date is string => date !== null)
    expect(dates).toHaveLength(days)
    expect(new Set(dates).size).toBe(days)
    expect(dates[0]).toBe(`${year}-01-01`)
    expect(dates.at(-1)).toBe(`${year}-12-31`)
    expect(dates.includes(`${year}-02-29`)).toBe(days === 366)
    expect(months.map(({ month }) => month)).toEqual(Array.from({ length: 12 }, (_, i) => i))
    for (const { month, column } of months) {
      expect(weeks[column]).toContain(`${year}-${String(month + 1).padStart(2, '0')}-01`)
    }
  })

  it('aligns weekdays and confines padding to year boundaries for every start weekday', () => {
    const starts = new Set<number>()
    for (let year = 2020; year <= 2035; year++) {
      const { weeks } = createAnnualCalendar(year)
      const cells = weeks.flat()
      const first = cells.findIndex((date) => date !== null)
      starts.add(first)
      expect(first).toBe((new Date(Date.UTC(year, 0, 1)).getUTCDay() + 6) % 7)
      expect(cells.slice(0, first).every((date) => date === null)).toBe(true)
      const count = cells.filter((date) => date !== null).length
      expect(cells.slice(first + count).every((date) => date === null)).toBe(true)
      let previous = 0
      for (const week of weeks) {
        expect(week).toHaveLength(7)
        week.forEach((date, row) => {
          if (date === null) return
          const timestamp = Date.parse(`${date}T00:00:00Z`)
          expect((new Date(timestamp).getUTCDay() + 6) % 7).toBe(row)
          if (previous) expect(timestamp - previous).toBe(86_400_000)
          previous = timestamp
        })
      }
    }
    expect(starts.size).toBe(7)
  })

  it('includes the 54th week when a leap year starts on Sunday', () => {
    const { weeks } = createAnnualCalendar(2012)
    expect(weeks).toHaveLength(54)
    expect(weeks[0]).toEqual([null, null, null, null, null, null, '2012-01-01'])
    expect(weeks.at(-1)).toEqual(['2012-12-31', null, null, null, null, null, null])
  })

  it.each([
    [2023, 6, 6], // Sunday to Sunday
    [2024, 0, 1], // Monday to Tuesday (leap year)
    [2026, 3, 3], // Thursday to Thursday
    [2028, 5, 6], // Saturday to Sunday (leap year)
  ])('places the first and last dates in their weekday rows in %i', (year, firstRow, lastRow) => {
    const { weeks } = createAnnualCalendar(year)
    expect(weeks[0][firstRow]).toBe(`${year}-01-01`)
    expect(weeks[0].slice(0, firstRow)).toEqual(Array(firstRow).fill(null))
    const lastWeek = weeks.at(-1)!
    expect(lastWeek[lastRow]).toBe(`${year}-12-31`)
    expect(lastWeek.slice(lastRow + 1)).toEqual(Array(6 - lastRow).fill(null))
  })
})
