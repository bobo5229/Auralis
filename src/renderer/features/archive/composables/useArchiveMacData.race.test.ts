import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import type { DailyAlbumStats, ListeningHeatmap } from '@shared/types/archive'
import { auralis } from '@renderer/shared/ipc/client'
import { useArchiveMacData, type ArchiveMacDataOptions } from './useArchiveMacData'

vi.mock('@renderer/shared/ipc/client', () => ({
  auralis: { archive: { getListeningHeatmap: vi.fn() } },
}))
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}
const scope = () => effectScope()
const scopes: ReturnType<typeof scope>[] = []
const heatmap = (year: number, firstRecordedYear: number | null = 2024): ListeningHeatmap => ({
  year,
  firstRecordedYear,
  days: [{ date: `${year}-05-20`, playCount: 2, durationSeconds: 240 }],
})
const stats = (date: string, key = date): DailyAlbumStats => ({
  date,
  items: [
    {
      key,
      albumKey: null,
      title: key,
      artist: 'Artist',
      artworkCacheKey: null,
      playCount: 1,
      durationSeconds: 180,
    },
  ],
})
function setup(
  fetch: (date: string) => Promise<DailyAlbumStats>,
  selection: Pick<ArchiveMacDataOptions, 'initialDate' | 'initialAlbumKey'> = {},
) {
  const owner = scope()
  scopes.push(owner)
  return owner.run(() =>
    useArchiveMacData({ now: () => new Date(2026, 9, 1), getDailyAlbumStats: fetch, ...selection }),
  )!
}
beforeEach(() => {
  vi.mocked(auralis.archive.getListeningHeatmap).mockReset()
  vi.mocked(auralis.archive.getListeningHeatmap).mockImplementation(async (year) => heatmap(year))
})
afterEach(() => scopes.splice(0).forEach((s) => s.stop()))

describe('Mac archive request ownership', () => {
  it.each(['2026-09-30', '2025-05-20'])(
    'loads the restored date %s and album without querying today first',
    async (date) => {
      const response = stats(date, 'first')
      response.items.push({ ...response.items[0], key: 'restored' })
      const fetch = vi.fn(async () => response)
      const data = setup(fetch, { initialDate: date, initialAlbumKey: 'restored' })
      await flush()

      const year = Number(date.slice(0, 4))
      expect(fetch).toHaveBeenCalledExactlyOnceWith(date)
      expect(auralis.archive.getListeningHeatmap).toHaveBeenCalledExactlyOnceWith(year)
      expect(data.selectedYear.value).toBe(year)
      expect(data.browsingYear.value).toBe(year)
      expect(data.selectedDate.value).toBe(date)
      expect(data.selectedAlbumKey.value).toBe('restored')
    },
  )

  it.each(['2025-02-30', '2027-01-01', '1969-12-31', 'invalid', null])(
    'falls back to today for an invalid saved date (%s)',
    async (initialDate) => {
      const fetch = vi.fn(async (date: string) => stats(date))
      const data = setup(fetch, { initialDate, initialAlbumKey: 'stale' })
      await flush()
      expect(fetch).toHaveBeenCalledExactlyOnceWith('2026-10-01')
      expect(auralis.archive.getListeningHeatmap).toHaveBeenCalledExactlyOnceWith(2026)
      expect(data.selectedDate.value).toBe('2026-10-01')
      expect(data.selectedAlbumKey.value).toBe('2026-10-01')
    },
  )

  it('selects the first remaining album if the restored album has disappeared', async () => {
    const fetch = vi.fn(async (date: string) => stats(date, 'remaining'))
    const data = setup(fetch, { initialDate: '2026-09-30', initialAlbumKey: 'removed' })
    await flush()
    expect(fetch).toHaveBeenCalledExactlyOnceWith('2026-09-30')
    expect(data.selectedAlbumKey.value).toBe('remaining')
  })

  it('invalidates a pending day immediately when selecting another year', async () => {
    const old = deferred<DailyAlbumStats>()
    const year = deferred<ListeningHeatmap>()
    const fetch = vi.fn((date: string) =>
      date === '2026-10-01' ? old.promise : Promise.resolve(stats(date)),
    )
    const data = setup(fetch)
    await flush()
    vi.mocked(auralis.archive.getListeningHeatmap).mockReturnValueOnce(year.promise)
    data.selectYear(2025)
    old.resolve(stats('2026-10-01', 'stale'))
    await flush()
    expect(data.items.value).toEqual([])
    expect(data.selectedDate.value).toBeNull()
    year.resolve(heatmap(2025))
    await flush()
    expect(data.selectedDate.value).toBe('2025-05-20')
    expect(data.items.value[0]?.key).toBe('2025-05-20')
  })

  it('keeps the latest explicit cross-year date while calendar requests finish', async () => {
    const year = deferred<ListeningHeatmap>()
    const data = setup(async (date) => stats(date))
    await flush()
    vi.mocked(auralis.archive.getListeningHeatmap).mockReturnValueOnce(year.promise)
    await data.selectDate('2025-03-01')
    await data.selectDate('2025-03-02')
    year.resolve(heatmap(2025))
    await flush()
    expect(data.selectedDate.value).toBe('2025-03-02')
    expect(data.items.value[0]?.key).toBe('2025-03-02')
  })

  it('refreshes calendar and resolves loading if refresh supersedes initial stats', async () => {
    const old = deferred<DailyAlbumStats>()
    const fetch = vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue(stats('2026-10-01', 'fresh'))
    const data = setup(fetch)
    await data.refresh()
    expect(data.dayLoading.value).toBe(false)
    expect(auralis.archive.getListeningHeatmap).toHaveBeenCalledTimes(2)
    old.resolve(stats('2026-10-01', 'old'))
    await flush()
    expect(data.items.value[0]?.key).toBe('fresh')
  })

  it('does not reset a selected date when retrying the calendar', async () => {
    const data = setup(async (date) => stats(date))
    await flush()
    await data.selectDate('2026-07-10')
    data.retryCalendar()
    await flush()
    expect(data.selectedDate.value).toBe('2026-07-10')
  })

  it('keeps a new selection made during refresh and drops stale refresh results', async () => {
    const pending = deferred<DailyAlbumStats>()
    const fetch = vi.fn(async (date: string) => stats(date))
    const data = setup(fetch)
    await flush()
    fetch.mockReturnValueOnce(pending.promise)
    const refresh = data.refresh()
    await data.selectDate('2025-02-01')
    pending.resolve(stats('2026-10-01', 'stale-refresh'))
    await refresh
    expect(data.items.value[0]?.key).toBe('2025-02-01')
  })

  it('rejects impossible/future dates without requests and resets the year range on clear', async () => {
    const fetch = vi.fn(async (date: string) => stats(date))
    const data = setup(fetch)
    await flush()
    await data.selectDate('2025-02-30')
    await data.selectDate('2027-01-01')
    expect(fetch).toHaveBeenCalledTimes(1)
    vi.mocked(auralis.archive.getListeningHeatmap).mockResolvedValueOnce(heatmap(2026, null))
    await data.refresh()
    expect(data.years.value).toEqual([2026])
  })
})
