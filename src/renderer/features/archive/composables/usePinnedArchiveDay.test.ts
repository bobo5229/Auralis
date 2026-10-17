import { effectScope, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import type { DailyPlayCount } from '@shared/types/listeningArchive'
import { usePinnedArchiveDay } from './usePinnedArchiveDay'

const days2026: DailyPlayCount[] = [
  { date: '2026-03-01', playCount: 5, durationSeconds: 900 },
  { date: '2026-10-09', playCount: 2, durationSeconds: 600 },
]
const days2025: DailyPlayCount[] = [{ date: '2025-07-04', playCount: 1, durationSeconds: 180 }]
const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

function fixture() {
  const scope = effectScope()
  const days = ref<DailyPlayCount[]>([])
  const year = ref(2026)
  const state = scope.run(() => usePinnedArchiveDay(days, year))!
  return { scope, days, year, state }
}

describe('pinned archive day', () => {
  it('follows the newest active day until the user pins one', async () => {
    const { scope, days, state } = fixture()
    expect(state.date.value).toBeNull()
    days.value = days2026
    await flush()
    expect(state.date.value).toBe('2026-10-09')
    state.pin('2026-03-01')
    days.value = [...days2026, { date: '2026-11-01', playCount: 1, durationSeconds: 60 }]
    await flush()
    expect(state.date.value).toBe('2026-03-01')
    scope.stop()
  })

  it('drops the pin on a year change and selects the new year latest day', async () => {
    const { scope, days, year, state } = fixture()
    days.value = days2026
    await flush()
    state.pin('2026-03-01')
    year.value = 2025
    expect(state.date.value).toBeNull()
    days.value = days2025
    await flush()
    expect(state.date.value).toBe('2025-07-04')
    scope.stop()
  })

  it('keeps a pinned date even when its year has no other activity', async () => {
    const { scope, state } = fixture()
    state.pin('2026-01-01')
    expect(state.date.value).toBe('2026-01-01')
    scope.stop()
  })
})
