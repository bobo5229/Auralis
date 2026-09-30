import { computed, onScopeDispose, ref, watch } from 'vue'
import type { DailyListeningDetail, ListeningRankingItem } from '@shared/types/archive'
import { auralis } from '@renderer/shared/ipc/client'
import { useArchiveCalendar } from './useArchiveCalendar'
import { formatArchiveDateKey } from './useArchiveRanking'

export function useArchiveCanvasData() {
  const currentYear = new Date().getFullYear()
  const selectedYear = ref(currentYear)
  const calendar = useArchiveCalendar(selectedYear, { loadAnnualInsights: false })
  const selectedDate = ref<string | null>(null)
  const detail = ref<DailyListeningDetail | null>(null)
  const albums = ref<ListeningRankingItem[]>([])
  const dayLoading = ref(false)
  const detailError = ref<string | null>(null)
  const albumsError = ref<string | null>(null)
  const firstRecordedYear = ref(currentYear)
  const years = computed(() =>
    Array.from({ length: currentYear - firstRecordedYear.value + 1 }, (_, i) => currentYear - i),
  )
  let yearRequest = 0
  let dayRequest = 0

  function clearDay(): void {
    ++dayRequest
    detail.value = null
    albums.value = []
    dayLoading.value = false
    detailError.value = null
    albumsError.value = null
  }

  async function selectDate(date: string): Promise<void> {
    if (calendar.isLoading.value || calendar.errorMessage.value) return
    const day = calendar.calendarDays.value.find((day) => day.date === date)
    if (!day || day.isFuture) return
    clearDay()
    selectedDate.value = date
    const request = dayRequest
    dayLoading.value = true
    const [tracksResult, albumsResult] = await Promise.allSettled([
      auralis.archive.getDailyListeningDetail(date),
      auralis.archive.getListeningRanking({ range: 'day', target: 'album', date }),
    ])
    if (request !== dayRequest) return
    if (tracksResult.status === 'fulfilled') detail.value = tracksResult.value
    else detailError.value = '无法读取当天歌曲，请重试'
    if (albumsResult.status === 'fulfilled') albums.value = albumsResult.value.items.slice(0, 5)
    else albumsError.value = '无法读取当天专辑，请重试'
    dayLoading.value = false
  }

  async function refresh(preserveDate = true): Promise<void> {
    const request = ++yearRequest
    const previousDate = preserveDate ? selectedDate.value : null
    clearDay()
    selectedDate.value = null
    await calendar.loadHeatmap()
    if (request !== yearRequest || calendar.errorMessage.value) return
    firstRecordedYear.value = Math.min(
      currentYear,
      calendar.heatmap.value?.firstRecordedYear ?? currentYear,
    )
    if (!years.value.includes(selectedYear.value)) {
      selectedYear.value = currentYear
      return
    }
    const days = calendar.calendarDays.value
    const date =
      previousDate && days.some((day) => day.date === previousDate && !day.isFuture)
        ? previousDate
        : selectedYear.value === currentYear
          ? formatArchiveDateKey(new Date())
          : [...days].reverse().find((day) => day.playCount > 0 && !day.isFuture)?.date
    if (date) await selectDate(date)
  }

  watch(selectedYear, () => void refresh(false), { immediate: true, flush: 'sync' })
  onScopeDispose(() => {
    ++yearRequest
    ++dayRequest
  })
  return {
    ...calendar,
    selectedYear,
    selectedDate,
    years,
    detail,
    albums,
    dayLoading,
    detailError,
    albumsError,
    selectDate,
    refresh,
  }
}
