import { uiText } from '@renderer/i18n'
import { computed, onScopeDispose, ref, watch } from 'vue'
import type { DailyAlbumStats, DailyAlbumStatsItem } from '@shared/types/archive'
import { auralis } from '@renderer/shared/ipc/client'
import { useArchiveCalendar } from './useArchiveCalendar'

function formatDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isSelectableDate(date: string | null | undefined, today: string): date is string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today || date < '1970-01-01')
    return false
  const [year, month, day] = date.split('-').map(Number)
  return formatDateKey(new Date(year, month - 1, day)) === date
}

export interface ArchiveMacDataOptions {
  now?: () => Date
  getDailyAlbumStats?: (date: string) => Promise<DailyAlbumStats>
  initialDate?: string | null
  initialAlbumKey?: string | null
}

export function useArchiveMacData(options: ArchiveMacDataOptions = {}) {
  const getNow = options.now ?? (() => new Date())
  const fetchStats =
    options.getDailyAlbumStats ?? ((date: string) => auralis.archive.getDailyAlbumStats(date))

  const now = getNow()
  const currentYear = ref(now.getFullYear())
  const todayKey = ref(formatDateKey(now))
  const hasInitialDate = isSelectableDate(options.initialDate, todayKey.value)
  const initialDate = hasInitialDate ? options.initialDate! : todayKey.value

  const selectedYear = ref(Number(initialDate.slice(0, 4)))
  const selectedDate = ref<string | null>(initialDate)
  const firstRecordedYear = ref(currentYear.value)
  const browsingYear = ref(selectedYear.value)
  let hasRecordedHistory = false

  const years = computed(() => {
    const minYear = Math.min(firstRecordedYear.value, currentYear.value)
    const count = currentYear.value - minYear + 1
    return Array.from({ length: count }, (_, i) => currentYear.value - i)
  })

  const calendar = useArchiveCalendar(selectedYear)
  // Browsing another year must not replace the selected day's calendar/default request.
  const browsingCalendar = useArchiveCalendar(browsingYear)
  const visibleCalendar = computed(() =>
    browsingYear.value === selectedYear.value ? calendar : browsingCalendar,
  )

  const items = ref<DailyAlbumStatsItem[]>([])
  const selectedAlbumKey = ref<string | null>(
    hasInitialDate ? (options.initialAlbumKey ?? null) : null,
  )
  const dayLoading = ref(false)
  const dayErrorKey = ref<string | null>(null)
  const dayError = computed(() => (dayErrorKey.value ? uiText(dayErrorKey.value) : null))

  let yearRequestToken = 0
  let dayRequestToken = 0
  let chooseYearDefault = false
  let pendingDefaultYear: number | null = null
  let disposed = false
  let clockTimer: ReturnType<typeof setTimeout> | undefined

  function syncClock(): void {
    if (disposed) return
    const now = getNow()
    todayKey.value = formatDateKey(now)
    currentYear.value = now.getFullYear()
    if (!hasRecordedHistory) firstRecordedYear.value = currentYear.value
    if (typeof window !== 'undefined') {
      clearTimeout(clockTimer)
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      clockTimer = setTimeout(syncClock, Math.max(1000, midnight.getTime() - now.getTime()))
    }
  }
  function handleVisibility(): void {
    if (!document.hidden) syncClock()
  }
  syncClock()
  if (typeof document !== 'undefined')
    document.addEventListener('visibilitychange', handleVisibility)

  onScopeDispose(() => {
    disposed = true
    ++yearRequestToken
    ++dayRequestToken
    clearTimeout(clockTimer)
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', handleVisibility)
  })

  async function loadYearData(year: number, chooseDefault = false): Promise<void> {
    const token = ++yearRequestToken
    const dateToken = dayRequestToken
    await calendar.loadHeatmap()
    if (token !== yearRequestToken || disposed) return
    syncClock()
    if (calendar.errorMessage.value) {
      if (chooseDefault && dateToken === dayRequestToken) dayLoading.value = false
      return
    }
    if (calendar.heatmap.value) {
      hasRecordedHistory = calendar.heatmap.value.firstRecordedYear !== null
      firstRecordedYear.value = Math.min(
        currentYear.value,
        calendar.heatmap.value.firstRecordedYear ?? currentYear.value,
      )
    }
    if (!years.value.includes(selectedYear.value)) {
      await selectDate(todayKey.value)
      return
    }
    if (!years.value.includes(browsingYear.value)) browsingYear.value = selectedYear.value
    if (chooseDefault && dateToken === dayRequestToken) {
      if (year === currentYear.value) {
        await selectDate(todayKey.value)
      } else {
        const days = calendar.calendarDays.value
        const lastActive = [...days]
          .reverse()
          .find((day) => day.playCount > 0 && day.date <= todayKey.value)
        const dateToSelect = lastActive?.date ?? `${year}-01-01`
        await selectDate(dateToSelect)
      }
    }
  }

  async function selectDate(date: string): Promise<void> {
    if (disposed) return
    syncClock()
    if (!isSelectableDate(date, todayKey.value)) return
    const targetYear = Number(date.slice(0, 4))
    chooseYearDefault = false
    pendingDefaultYear = null
    browsingYear.value = targetYear
    if (targetYear !== selectedYear.value) {
      selectedYear.value = targetYear
    }
    selectedDate.value = date
    items.value = []
    selectedAlbumKey.value = null
    await readDay(date)
  }

  async function readDay(
    date: string,
    { preserveSelection = false, isRefresh = false } = {},
  ): Promise<void> {
    const token = ++dayRequestToken
    dayLoading.value = true
    dayErrorKey.value = null
    try {
      const result = await fetchStats(date)
      if (token !== dayRequestToken || disposed || selectedDate.value !== date) return
      const previousKey = preserveSelection ? selectedAlbumKey.value : null
      items.value = result.items.slice(0, 5)
      selectedAlbumKey.value = items.value.some((item) => item.key === previousKey)
        ? previousKey
        : (items.value[0]?.key ?? null)
      dayLoading.value = false
    } catch {
      if (token !== dayRequestToken || disposed) return
      dayErrorKey.value = isRefresh ? 'archive.mac.refreshError' : 'archive.mac.dayError'
      dayLoading.value = false
    }
  }

  function selectYear(year: number): void {
    syncClock()
    if (disposed || !years.value.includes(year)) return
    if (year === selectedYear.value) {
      browsingYear.value = year
      return
    }
    ++dayRequestToken
    selectedDate.value = null
    items.value = []
    selectedAlbumKey.value = null
    dayErrorKey.value = null
    dayLoading.value = true
    chooseYearDefault = true
    pendingDefaultYear = year
    selectedYear.value = year
  }

  function browseYear(year: number): void {
    syncClock()
    if (disposed || !years.value.includes(year) || year === browsingYear.value) return
    browsingYear.value = year
    if (year !== selectedYear.value) void browsingCalendar.loadHeatmap()
  }

  function retryCalendar(): void {
    if (disposed) return
    syncClock()
    if (browsingYear.value !== selectedYear.value) void browsingCalendar.loadHeatmap()
    else void loadYearData(selectedYear.value, pendingDefaultYear === selectedYear.value)
  }

  function selectAlbum(key: string): void {
    if (!disposed && items.value.some((item) => item.key === key)) selectedAlbumKey.value = key
  }

  async function refresh(): Promise<void> {
    if (disposed) return
    syncClock()
    await Promise.all([
      selectedDate.value
        ? readDay(selectedDate.value, { preserveSelection: true, isRefresh: true })
        : Promise.resolve(),
      loadYearData(selectedYear.value, pendingDefaultYear === selectedYear.value),
      browsingYear.value !== selectedYear.value
        ? browsingCalendar.loadHeatmap()
        : Promise.resolve(),
    ])
  }

  // Watch year change
  watch(
    selectedYear,
    (newYear) => {
      browsingYear.value = newYear
      const chooseDefault = chooseYearDefault
      chooseYearDefault = false
      void loadYearData(newYear, chooseDefault)
    },
    { flush: 'sync' },
  )

  // Load the restored selection directly, without an unused request for today.
  void loadYearData(selectedYear.value)
  void readDay(initialDate, { preserveSelection: true })

  return {
    selectedYear,
    browsingYear,
    todayKey,
    selectedDate,
    firstRecordedYear,
    years,
    items,
    selectedAlbumKey,
    dayLoading,
    dayError,
    calendarLoading: computed(() => visibleCalendar.value.isLoading.value),
    calendarError: computed(() => visibleCalendar.value.errorMessage.value),
    calendarDays: computed(() => visibleCalendar.value.calendarDays.value),
    selectDate,
    selectYear,
    browseYear,
    selectAlbum,
    refresh,
    retryCalendar,
    retryDay: (date: string) => void selectDate(date),
  }
}
