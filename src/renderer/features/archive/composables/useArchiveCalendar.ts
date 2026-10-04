import { i18n, uiText } from '@renderer/i18n'
import { computed, onScopeDispose, ref, type Ref } from 'vue'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import type { AnnualListeningInsights, ListeningHeatmap } from '@shared/types/archive'
import type { EditorialLinerNotesData } from '../utils/editorialLinerNotes'
import { formatArchiveDateKey as formatDateKey } from '../utils/formatArchiveDateKey'

export interface CalendarDay {
  date: string
  label: string
  playCount: number
  durationSeconds: number
  level: 0 | 1 | 2 | 3 | 4
  isFuture: boolean
}

export function useArchiveCalendar(
  selectedYear: Ref<number>,
  options: { loadAnnualInsights?: boolean } = {},
) {
  let requestId = 0
  onScopeDispose(() => ++requestId)
  const heatmap = ref<ListeningHeatmap | null>(null)
  const annualInsights = ref<AnnualListeningInsights | null>(null)
  const annualInsightsError = ref(false)
  const isLoading = ref(true)
  const hasError = ref(false)
  const errorMessage = computed(() => (hasError.value ? uiText('archive.mac.calendarError') : null))
  const weekdayNames = computed(() =>
    Array.from({ length: 7 }, (_, index) =>
      new Intl.DateTimeFormat(i18n.global.locale.value, { weekday: 'short' }).format(
        new Date(2026, 0, 4 + index),
      ),
    ),
  )
  function getIntensityLevel(playCount: number): CalendarDay['level'] {
    if (playCount >= 7) return 4
    if (playCount >= 4) return 3
    if (playCount >= 2) return 2
    if (playCount >= 1) return 1
    return 0
  }

  const weekdayOrder = computed(() => {
    const firstWeekday = new Date(selectedYear.value, 0, 1).getDay()
    return Array.from({ length: 7 }, (_, index) => weekdayNames.value[(firstWeekday + index) % 7])
  })

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

  const monthMarkers = computed(() => {
    let elapsedDays = 0

    return Array.from({ length: 12 }, (_, month) => {
      const marker = {
        label: new Intl.DateTimeFormat(i18n.global.locale.value, { month: 'short' }).format(
          new Date(selectedYear.value, month, 1),
        ),
        column: Math.floor(elapsedDays / 7) + 1,
      }
      elapsedDays += new Date(selectedYear.value, month + 1, 0).getDate()
      return marker
    })
  })

  const peakDay = computed(() =>
    calendarDays.value
      .filter((day) => !day.isFuture)
      .reduce<CalendarDay | null>((peak, day) => {
        if (day.playCount <= 0) return peak
        if (!peak || day.playCount > peak.playCount) return day
        return peak
      }, null),
  )
  const linerNotesData = computed<EditorialLinerNotesData>(() => {
    const elapsedDays = calendarDays.value.filter((day) => !day.isFuture)
    const activeDays = elapsedDays.filter((day) => day.playCount > 0).length
    const totalPlays = elapsedDays.reduce((total, day) => total + day.playCount, 0)
    const totalDurationSeconds = elapsedDays.reduce((total, day) => total + day.durationSeconds, 0)

    return {
      year: selectedYear.value,
      activeDays,
      totalDaysInYear: calendarDays.value.length,
      totalPlays,
      totalDurationSeconds,
      peakDayDate: peakDay.value?.date ?? null,
      peakDayPlays: peakDay.value?.playCount ?? 0,
      isPending: activeDays === 0 && totalPlays === 0,
    }
  })
  async function loadHeatmap(): Promise<void> {
    const request = ++requestId
    isLoading.value = true
    hasError.value = false
    annualInsights.value = null
    annualInsightsError.value = false

    const year = selectedYear.value
    const [heatmapResult, insightsResult] = await Promise.allSettled([
      auralis.archive.getListeningHeatmap(year),
      options.loadAnnualInsights === false
        ? Promise.resolve(null)
        : auralis.archive.getAnnualListeningInsights(year),
    ])
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

    if (insightsResult.status === 'fulfilled') {
      annualInsights.value = insightsResult.value
    } else {
      annualInsightsError.value = true
    }

    isLoading.value = false
  }
  return {
    heatmap,
    isLoading,
    errorMessage,
    weekdayOrder,
    calendarDays,
    monthMarkers,
    peakDay,
    linerNotesData,
    loadHeatmap,
  }
}
