import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { auralis } from '@renderer/shared/ipc/client'
import { useArchiveMacData } from './useArchiveMacData'
import type { ListeningHeatmap } from '@shared/types/archive'

vi.mock('@renderer/shared/ipc/client', () => ({
  auralis: { archive: { getListeningHeatmap: vi.fn() } },
}))
vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { error: vi.fn() },
}))

const scopes: ReturnType<typeof effectScope>[] = []
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}
const heatmap = (year: number, firstRecordedYear: number | null = 2024): ListeningHeatmap => ({
  year,
  firstRecordedYear,
  days: [{ date: `${year}-05-20`, playCount: 2, durationSeconds: 240 }],
})
function setup(initial = new Date(2026, 9, 1, 23, 59)) {
  let now = initial
  const scope = effectScope()
  scopes.push(scope)
  const fetch = vi.fn(async (date: string) => ({ date, items: [] }))
  const data = scope.run(() => useArchiveMacData({ now: () => now, getDailyAlbumStats: fetch }))!
  return { data, fetch, scope, setNow: (date: Date) => (now = date) }
}
beforeEach(() => {
  vi.mocked(auralis.archive.getListeningHeatmap).mockReset()
  vi.mocked(auralis.archive.getListeningHeatmap).mockImplementation(async (year) => heatmap(year))
})
afterEach(() => scopes.splice(0).forEach((scope) => scope.stop()))

describe('Mac archive date boundaries', () => {
  it('accepts the new day after midnight without remounting', async () => {
    const { data, fetch, setNow } = setup()
    await flush()
    setNow(new Date(2026, 9, 2, 0, 1))
    await data.selectDate('2026-10-02')
    expect(data.todayKey.value).toBe('2026-10-02')
    expect(data.selectedDate.value).toBe('2026-10-02')
    expect(fetch).toHaveBeenLastCalledWith('2026-10-02')
    await data.selectDate('2026-10-03')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('adds the new year while preserving an explicitly selected historical day', async () => {
    const { data, setNow } = setup(new Date(2026, 11, 31, 23, 59))
    await flush()
    await data.selectDate('2024-05-20')
    setNow(new Date(2027, 0, 1, 0, 1))
    await data.refresh()
    expect(data.todayKey.value).toBe('2027-01-01')
    expect(data.years.value).toEqual([2027, 2026, 2025, 2024])
    expect(data.selectedDate.value).toBe('2024-05-20')
    data.selectYear(2027)
    await flush()
    expect(data.selectedDate.value).toBe('2027-01-01')
  })

  it('browses a different year without a daily query or selected date change', async () => {
    const { data, fetch } = setup()
    await flush()
    await data.selectDate('2024-12-20')
    fetch.mockClear()
    data.browseYear(2025)
    await flush()
    expect(data.browsingYear.value).toBe(2025)
    expect(data.selectedYear.value).toBe(2024)
    expect(data.selectedDate.value).toBe('2024-12-20')
    expect(fetch).not.toHaveBeenCalled()
    expect(data.calendarDays.value.find((day) => day.date === '2025-05-20')?.playCount).toBe(2)
    data.browseYear(2024)
    expect(data.calendarDays.value.find((day) => day.date === '2024-05-20')?.playCount).toBe(2)
  })

  it('returns the calendar to the selected year when that year is chosen from the menu', async () => {
    const { data, fetch } = setup()
    await flush()
    data.browseYear(2025)
    await flush()
    data.selectYear(2026)
    expect(data.browsingYear.value).toBe(2026)
    expect(data.selectedDate.value).toBe('2026-10-01')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('returns an invalid historical selection to today after records are cleared', async () => {
    const { data, fetch } = setup()
    await flush()
    await data.selectDate('2024-12-20')
    data.browseYear(2025)
    await flush()
    vi.mocked(auralis.archive.getListeningHeatmap).mockImplementation(async (year) => ({
      year,
      firstRecordedYear: null,
      days: [],
    }))
    await data.refresh()
    await flush()
    expect(data.years.value).toEqual([2026])
    expect(data.selectedYear.value).toBe(2026)
    expect(data.browsingYear.value).toBe(2026)
    expect(data.selectedDate.value).toBe('2026-10-01')
    expect(fetch).toHaveBeenLastCalledWith('2026-10-01')
    expect(data.dayLoading.value).toBe(false)
  })

  it('waits for a successful year retry before choosing its latest recorded date', async () => {
    const { data, fetch } = setup()
    await flush()
    fetch.mockClear()
    vi.mocked(auralis.archive.getListeningHeatmap).mockRejectedValueOnce(Error('heatmap failure'))
    data.selectYear(2025)
    await flush()
    expect(data.selectedDate.value).toBeNull()
    expect(data.calendarError.value).not.toBeNull()
    expect(data.dayLoading.value).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
    data.retryCalendar()
    await flush()
    expect(data.selectedDate.value).toBe('2025-05-20')
    expect(fetch).toHaveBeenCalledExactlyOnceWith('2025-05-20')
  })

  it('does not apply a failed year default after the user explicitly chooses another date', async () => {
    const { data, fetch } = setup()
    await flush()
    vi.mocked(auralis.archive.getListeningHeatmap).mockRejectedValueOnce(Error('heatmap failure'))
    data.selectYear(2025)
    await flush()
    await data.selectDate('2025-02-01')
    fetch.mockClear()
    data.retryCalendar()
    await flush()
    expect(data.selectedDate.value).toBe('2025-02-01')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('retries browsing errors without replacing the selected day', async () => {
    const { data, fetch } = setup()
    await flush()
    vi.mocked(auralis.archive.getListeningHeatmap).mockRejectedValueOnce(Error('browse failure'))
    data.browseYear(2025)
    await flush()
    expect(data.calendarError.value).not.toBeNull()
    data.retryCalendar()
    await flush()
    expect(data.calendarError.value).toBeNull()
    expect(data.selectedDate.value).toBe('2026-10-01')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('updates the date at midnight and releases its timer and visibility listener on disposal', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 1, 23, 59))
    vi.stubGlobal('window', {})
    const visibility = new EventTarget()
    Object.assign(visibility, { hidden: false })
    vi.stubGlobal('document', visibility)
    try {
      const scope = effectScope()
      scopes.push(scope)
      const fetch = vi.fn(async (date: string) => ({ date, items: [] }))
      const data = scope.run(() => useArchiveMacData({ getDailyAlbumStats: fetch }))!
      await flush()
      await vi.advanceTimersByTimeAsync(61_000)
      expect(data.todayKey.value).toBe('2026-10-02')
      expect(data.selectedDate.value).toBe('2026-10-01')
      expect(fetch).toHaveBeenCalledTimes(1)
      vi.setSystemTime(new Date(2026, 9, 3, 0, 1))
      visibility.dispatchEvent(new Event('visibilitychange'))
      expect(data.todayKey.value).toBe('2026-10-03')
      scope.stop()
      expect(vi.getTimerCount()).toBe(0)
      vi.setSystemTime(new Date(2026, 9, 4))
      visibility.dispatchEvent(new Event('visibilitychange'))
      expect(data.todayKey.value).toBe('2026-10-03')
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })
})
