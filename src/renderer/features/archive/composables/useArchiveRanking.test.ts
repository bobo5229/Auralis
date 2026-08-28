import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { ListeningRanking, ListeningRankingParams } from '@shared/types/archive'
import {
  addArchiveDays,
  formatArchiveDateKey,
  getArchiveWeekMonday,
  useArchiveRanking,
} from './useArchiveRanking'

const fixedNow = () => new Date(2026, 7, 24, 12)

function ranking(params: ListeningRankingParams, key: string): ListeningRanking {
  return {
    range: params.range,
    target: params.target,
    startDate: '2026-08-24',
    endDate: '2026-08-24',
    items: [
      {
        key,
        title: key,
        artist: null,
        artworkCacheKey: null,
        playCount: 1,
        durationSeconds: 60,
      },
    ],
  }
}

describe('archive ranking date logic', () => {
  it('formats local dates and resolves Monday across Sunday boundaries', () => {
    expect(formatArchiveDateKey(new Date(2026, 7, 24))).toBe('2026-08-24')
    expect(getArchiveWeekMonday(new Date(2026, 7, 23))).toBe('2026-08-17')
    expect(addArchiveDays('2026-12-28', 6)).toBe('2027-01-03')
  })

  it('builds a Monday-first month picker and marks future days', () => {
    const state = useArchiveRanking(ref(2026), {
      now: fixedNow,
      getListeningRanking: vi.fn(),
    })

    state.rankingPickerYear.value = 2026
    state.rankingPickerMonth.value = 8
    const cells = state.pickerCalendarDays.value

    expect(cells[0].dateStr).toBeNull()
    expect(cells[5].dateStr).toBe('2026-08-01')
    expect(cells.find((cell) => cell.dateStr === '2026-08-24')).toMatchObject({
      isToday: true,
      isFuture: false,
      isSelected: true,
    })
    expect(cells.find((cell) => cell.dateStr === '2026-08-25')?.isFuture).toBe(true)
  })
})

describe('useArchiveRanking requests', () => {
  it('builds the period-specific month parameters', async () => {
    const getListeningRanking = vi.fn(async (params: ListeningRankingParams) =>
      ranking(params, 'month-result'),
    )
    const state = useArchiveRanking(ref(2025), { now: fixedNow, getListeningRanking })
    state.rankingRange.value = 'month'
    state.rankingTarget.value = 'album'
    state.rankingYear.value = 2025
    state.rankingMonth.value = 12

    await state.loadListeningRanking()

    expect(getListeningRanking).toHaveBeenCalledWith({
      range: 'month',
      target: 'album',
      year: 2025,
      month: 12,
    })
    expect(state.listeningRanking.value?.items[0].key).toBe('month-result')
  })

  it('keeps the newest response when requests finish out of order', async () => {
    let resolveFirst!: (value: ListeningRanking) => void
    let resolveSecond!: (value: ListeningRanking) => void
    const getListeningRanking = vi
      .fn<(params: ListeningRankingParams) => Promise<ListeningRanking>>()
      .mockImplementationOnce(
        () => new Promise<ListeningRanking>((resolve) => (resolveFirst = resolve)),
      )
      .mockImplementationOnce(
        () => new Promise<ListeningRanking>((resolve) => (resolveSecond = resolve)),
      )
    const state = useArchiveRanking(ref(2026), { now: fixedNow, getListeningRanking })

    const firstRequest = state.loadListeningRanking()
    state.rankingTarget.value = 'album'
    const secondRequest = state.loadListeningRanking()
    resolveSecond(ranking({ range: 'day', target: 'album' }, 'newest'))
    await secondRequest
    resolveFirst(ranking({ range: 'day', target: 'track' }, 'stale'))
    await firstRequest

    expect(state.listeningRanking.value?.items[0].key).toBe('newest')
    expect(state.isRankingLoading.value).toBe(false)
  })
})
