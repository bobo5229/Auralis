import { effectScope, nextTick, type EffectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  DailyListeningDetail,
  ListeningHeatmap,
  ListeningRanking,
} from '@shared/types/archive'
import { useArchiveCanvasData } from './useArchiveCanvasData'

const api = vi.hoisted(() => ({
  getListeningHeatmap: vi.fn(),
  getAnnualListeningInsights: vi.fn(),
  getDailyListeningDetail: vi.fn(),
  getListeningRanking: vi.fn(),
}))
vi.mock('@renderer/shared/ipc/client', () => ({ auralis: { archive: api } }))
vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { error: vi.fn() },
}))

const scopes: EffectScope[] = []
function create() {
  const scope = effectScope()
  scopes.push(scope)
  return { scope, state: scope.run(useArchiveCanvasData)! }
}
async function settle() {
  for (let i = 0; i < 8; i++) await Promise.resolve()
  await nextTick()
}
function heatmap(year: number, dates: [string, number][] = []): ListeningHeatmap {
  return {
    year,
    firstRecordedYear: 2024,
    days: dates.map(([date, playCount]) => ({ date, playCount, durationSeconds: playCount * 120 })),
  }
}
function detail(date: string): DailyListeningDetail {
  return { date, totalPlayCount: 0, totalDurationSeconds: 0, tracks: [] }
}
function ranking(date: string, count = 0): ListeningRanking {
  return {
    range: 'day',
    target: 'album',
    startDate: date,
    endDate: date,
    items: Array.from({ length: count }, (_, i) => ({
      key: `${date}-${i}`,
      title: `Album ${i}`,
      artist: null,
      artworkCacheKey: null,
      playCount: count - i,
      durationSeconds: 120,
    })),
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 29, 12))
  vi.resetAllMocks()
  api.getListeningHeatmap.mockImplementation(async (year: number) => heatmap(year))
  api.getDailyListeningDetail.mockImplementation(async (date: string) => detail(date))
  api.getListeningRanking.mockImplementation(async ({ date }: { date: string }) => ranking(date))
})
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  vi.useRealTimers()
})

describe('archive canvas real data', () => {
  it('selects today even without plays and exposes recorded years without requesting annual insights', async () => {
    const { state } = create()
    await settle()
    expect(state.selectedDate.value).toBe('2026-09-29')
    expect(state.years.value).toEqual([2026, 2025, 2024])
    expect(state.albums.value).toEqual([])
    expect(api.getListeningRanking).toHaveBeenCalledWith({
      range: 'day',
      target: 'album',
      date: '2026-09-29',
    })
    expect(api.getAnnualListeningInsights).not.toHaveBeenCalled()
  })

  it('reuses play-count thresholds, leap dates, and selects the last active historical date', async () => {
    api.getListeningHeatmap.mockImplementation(async (year: number) =>
      heatmap(
        year,
        year === 2024
          ? [
              ['2024-01-01', 1],
              ['2024-01-02', 2],
              ['2024-02-29', 4],
              ['2024-12-20', 7],
            ]
          : [],
      ),
    )
    const { state } = create()
    await settle()
    expect(state.calendarDays.value).toHaveLength(365)
    state.selectedYear.value = 2024
    await settle()
    expect(state.calendarDays.value).toHaveLength(366)
    expect(state.calendarDays.value.filter((day) => day.playCount).map((day) => day.level)).toEqual(
      [1, 2, 3, 4],
    )
    expect(state.selectedDate.value).toBe('2024-12-20')
    expect(api.getListeningRanking).toHaveBeenLastCalledWith({
      range: 'day',
      target: 'album',
      date: '2024-12-20',
    })
  })

  it('does not substitute another day for an empty year and refuses future dates', async () => {
    const { state } = create()
    await settle()
    const count = api.getDailyListeningDetail.mock.calls.length
    await state.selectDate('2026-12-01')
    expect(api.getDailyListeningDetail).toHaveBeenCalledTimes(count)
    state.selectedYear.value = 2025
    await settle()
    expect(state.selectedDate.value).toBeNull()
    expect(state.detail.value).toBeNull()
    expect(state.albums.value).toEqual([])
    expect(api.getDailyListeningDetail).toHaveBeenCalledTimes(count)
  })

  it('keeps the backend ranking order and displays at most five, or fewer when available', async () => {
    api.getListeningRanking.mockImplementation(async ({ date }: { date: string }) =>
      ranking(date, date.endsWith('29') ? 7 : 2),
    )
    const { state } = create()
    await settle()
    expect(state.albums.value.map((album) => album.title)).toEqual([
      'Album 0',
      'Album 1',
      'Album 2',
      'Album 3',
      'Album 4',
    ])
    await state.selectDate('2026-09-28')
    expect(state.albums.value).toHaveLength(2)
  })

  it('discards late day results after selecting a different date', async () => {
    const slow = deferred<DailyListeningDetail>()
    const { state } = create()
    await settle()
    api.getDailyListeningDetail.mockImplementation((date: string) =>
      date.endsWith('27') ? slow.promise : Promise.resolve(detail(date)),
    )
    const old = state.selectDate('2026-09-27')
    await state.selectDate('2026-09-28')
    slow.resolve(detail('2026-09-27'))
    await old
    expect(state.selectedDate.value).toBe('2026-09-28')
    expect(state.detail.value?.date).toBe('2026-09-28')
  })

  it('discards stale year responses and pending day results on year changes', async () => {
    const slowYear = deferred<ListeningHeatmap>()
    const slowDay = deferred<DailyListeningDetail>()
    const { state } = create()
    await settle()
    api.getDailyListeningDetail.mockReturnValueOnce(slowDay.promise)
    const oldDay = state.selectDate('2026-09-28')
    api.getListeningHeatmap.mockImplementation((year: number) =>
      year === 2024 ? slowYear.promise : Promise.resolve(heatmap(year)),
    )
    state.selectedYear.value = 2024
    state.selectedYear.value = 2025
    await settle()
    slowYear.resolve(heatmap(2024, [['2024-02-29', 7]]))
    slowDay.resolve(detail('2026-09-28'))
    await oldDay
    await settle()
    expect(state.heatmap.value?.year).toBe(2025)
    expect(state.selectedDate.value).toBeNull()
    expect(state.detail.value).toBeNull()
  })

  it('shows independent errors and retries without hiding a successful album response', async () => {
    api.getDailyListeningDetail.mockRejectedValueOnce(new Error('offline'))
    api.getListeningRanking.mockResolvedValueOnce(ranking('2026-09-29', 2))
    const { state } = create()
    await settle()
    expect(state.detailError.value).toBeTruthy()
    expect(state.albumsError.value).toBeNull()
    expect(state.albums.value).toHaveLength(2)
    await state.selectDate('2026-09-29')
    expect(state.detailError.value).toBeNull()
    expect(state.dayLoading.value).toBe(false)
  })

  it('preserves the chosen date during statistics refresh and clears stale data on calendar failure', async () => {
    const { state } = create()
    await settle()
    await state.selectDate('2026-09-20')
    await state.refresh()
    expect(state.selectedDate.value).toBe('2026-09-20')
    api.getListeningHeatmap.mockRejectedValueOnce(new Error('unavailable'))
    await state.refresh()
    expect(state.errorMessage.value).toBeTruthy()
    expect(state.heatmap.value).toBeNull()
    expect(state.selectedDate.value).toBeNull()
    expect(state.albums.value).toEqual([])
  })

  it('does not apply results after the page scope is disposed', async () => {
    const slow = deferred<ListeningHeatmap>()
    api.getListeningHeatmap.mockReturnValueOnce(slow.promise)
    const { state, scope } = create()
    scope.stop()
    slow.resolve(heatmap(2026))
    await settle()
    expect(state.heatmap.value).toBeNull()
    expect(api.getDailyListeningDetail).not.toHaveBeenCalled()
  })
})
