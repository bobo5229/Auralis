import { i18n, uiText } from '@renderer/i18n'
import { computed, onScopeDispose, ref, type Ref } from 'vue'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import type { ListeningHeatmap } from '@shared/types/archive'
import { formatArchiveDateKey as formatDateKey } from '../utils/formatArchiveDateKey'

export interface CalendarDay {
  date: string
  label: string
  playCount: number
  durationSeconds: number
  level: 0 | 1 | 2 | 3 | 4
  isFuture: boolean
}

export function useArchiveCalendar(selectedYear: Ref<number>) {
  let requestId = 0
  onScopeDispose(() => ++requestId)
  const heatmap = ref<ListeningHeatmap | null>(null)
  const isLoading = ref(true)
  const hasError = ref(false)
  const errorMessage = computed(() => (hasError.value ? uiText('archive.mac.calendarError') : null))
  function getIntensityLevel(playCount: number): CalendarDay['level'] {
    if (playCount >= 7) return 4
    if (playCount >= 4) return 3
    if (playCount >= 2) return 2
    if (playCount >= 1) return 1
    return 0
  }

  const calendarDays = computed<CalendarDay[]>(() => {
    const statsByDate = new Map((heatmap.value?.days ?? []).map((day) => [day.date, day] as const))
    const todayKey = formatDateKey(new Date())
    const daysInYear = new Date(selectedYear.value, 1, 29).getMonth() === 1 ? 366 : 365
    const dateFormatter = new Intl.DateTimeFormat(i18n.global.locale.value, {
      month: 'short',
      day: 'numeric',
    })

    return Array.from({ length: daysInYear }, (_, index) => {
      const date = new Date(selectedYear.value, 0, index + 1)
      const dateKey = formatDateKey(date)
      const dayStats = statsByDate.get(dateKey)
      const playCount = dayStats?.playCount ?? 0

      return {
        date: dateKey,
        label: dateFormatter.format(date),
        playCount,
        durationSeconds: dayStats?.durationSeconds ?? 0,
        level: getIntensityLevel(playCount),
        isFuture: dateKey > todayKey,
      }
    })
  })

  async function loadHeatmap(): Promise<void> {
    const request = ++requestId
    isLoading.value = true
    hasError.value = false

    const year = selectedYear.value
    const [heatmapResult] = await Promise.allSettled([auralis.archive.getListeningHeatmap(year)])
    if (request !== requestId || selectedYear.value !== year) return

    if (heatmapResult.status === 'fulfilled') {
      heatmap.value = heatmapResult.value
    } else {
      heatmap.value = null
      rendererDiagnostics.error({
        scope: 'archive.heatmap',
        message: 'Failed to load listening heatmap',
        cause: heatmapResult.reason,
      })
      hasError.value = true
    }

    isLoading.value = false
  }
  return {
    heatmap,
    isLoading,
    errorMessage,
    calendarDays,
    loadHeatmap,
  }
}
