import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { i18n } from '@renderer/i18n'
import { useArchiveCalendar } from './useArchiveCalendar'

vi.mock('@renderer/shared/ipc/client', () => ({ auralis: {} }))

afterEach(() => {
  vi.restoreAllMocks()
  i18n.global.locale.value = 'zh-Hans'
})

describe('archive calendar date formatting', () => {
  it('keeps leap days, records and locale changes while bounding formatter construction', () => {
    const scope = effectScope()
    const year = ref(2024)
    const calendar = scope.run(() => useArchiveCalendar(year))!
    calendar.heatmap.value = {
      year: 2024,
      firstRecordedYear: 2024,
      days: [{ date: '2024-02-29', playCount: 5, durationSeconds: 420 }],
    }
    const formatter = vi.spyOn(Intl, 'DateTimeFormat')
    try {
      const days = calendar.calendarDays.value
      expect(days).toHaveLength(366)
      expect(days[59]).toMatchObject({
        date: '2024-02-29',
        label: '2月29日',
        playCount: 5,
        durationSeconds: 420,
        level: 3,
      })
      expect(days.at(-1)?.date).toBe('2024-12-31')
      expect(formatter).toHaveBeenCalledTimes(1)
      i18n.global.locale.value = 'en'
      expect(calendar.calendarDays.value[59]).toMatchObject({
        date: '2024-02-29',
        label: 'Feb 29',
        playCount: 5,
        durationSeconds: 420,
      })
      expect(formatter).toHaveBeenCalledTimes(2)
      year.value = 2025
      expect(calendar.calendarDays.value).toHaveLength(365)
      expect(calendar.calendarDays.value[59]).toMatchObject({
        date: '2025-03-01',
        label: 'Mar 1',
        playCount: 0,
      })
      expect(formatter).toHaveBeenCalledTimes(3)
    } finally {
      scope.stop()
    }
  })
})
