import { effectScope, nextTick, type EffectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DailyListeningDetail } from '@shared/types/archive'
import type { CalendarDay } from './useArchiveCalendar'
import { useArchiveDailyDetail } from './useArchiveDailyDetail'

vi.mock('@renderer/shared/diagnostics/rendererDiagnostics', () => ({
  rendererDiagnostics: { error: vi.fn() },
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function day(date: string): CalendarDay {
  return { date, label: date, playCount: 1, durationSeconds: 60, level: 1, isFuture: false }
}

function detail(date: string): DailyListeningDetail {
  return { date, totalPlayCount: 1, totalDurationSeconds: 60, tracks: [] }
}

const event = {
  currentTarget: {
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 30, height: 40 }),
  },
} as unknown as MouseEvent

describe('useArchiveDailyDetail', () => {
  let scope: EffectScope

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', globalThis)
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it.each(['resolve', 'reject'] as const)(
    'ignores an older request that will %s',
    async (settle) => {
      const first = deferred<DailyListeningDetail>()
      const second = deferred<DailyListeningDetail>()
      const read = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
      const state = scope.run(() => useArchiveDailyDetail(read))!
      const oldRequest = state.openDailyDetail(event, day('2026-09-01'))
      await nextTick()
      const newRequest = state.openDailyDetail(event, day('2026-09-02'))
      await nextTick()

      if (settle === 'resolve') first.resolve(detail('2026-09-01'))
      else first.reject(new Error('stale failure'))
      await oldRequest
      expect(state.isDetailLoading.value).toBe(true)
      expect(state.dailyDetail.value).toBeNull()
      expect(state.detailError.value).toBeNull()

      second.resolve(detail('2026-09-02'))
      await newRequest
      expect(state.dailyDetail.value?.date).toBe('2026-09-02')
      expect(state.isDetailLoading.value).toBe(false)
    },
  )

  it('keeps a reopened same-day dialog after the old closing animation', async () => {
    const read = vi.fn(async (date: string) => detail(date))
    const state = scope.run(() => useArchiveDailyDetail(read))!
    await state.openDailyDetail(event, day('2026-09-01'))
    state.closeDailyDetail()
    expect(state.detailDialog.value?.expanded).toBe(false)
    await vi.advanceTimersByTimeAsync(120)
    await state.openDailyDetail(event, day('2026-09-01'))
    await vi.advanceTimersByTimeAsync(240)
    expect(state.detailDialog.value).toMatchObject({ date: '2026-09-01', expanded: true })
    expect(state.dailyDetail.value?.date).toBe('2026-09-01')
  })

  it.each(['clear', 'dispose'] as const)(
    'cancels pending state and close timers on %s',
    async (action) => {
      const pending = deferred<DailyListeningDetail>()
      const state = scope.run(() => useArchiveDailyDetail(() => pending.promise))!
      const request = state.openDailyDetail(event, day('2026-09-01'))
      await nextTick()
      state.closeDailyDetail()
      expect(vi.getTimerCount()).toBe(1)
      if (action === 'clear') state.clearDailyDetail()
      else scope.stop()
      expect(vi.getTimerCount()).toBe(0)
      pending.resolve(detail('2026-09-01'))
      await request
      expect(state.detailDialog.value).toBeNull()
      expect(state.dailyDetail.value).toBeNull()
      expect(state.isDetailLoading.value).toBe(false)
    },
  )

  it('does not open or query future days', async () => {
    const read = vi.fn()
    const state = scope.run(() => useArchiveDailyDetail(read))!
    await state.openDailyDetail(event, { ...day('2099-01-01'), isFuture: true })
    expect(read).not.toHaveBeenCalled()
    expect(state.detailDialog.value).toBeNull()
  })
})
