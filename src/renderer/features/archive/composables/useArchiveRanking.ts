import { computed, ref, type Ref } from 'vue'
import type {
  ListeningRanking,
  ListeningRankingParams,
  ListeningRankingRange,
  ListeningRankingTarget,
} from '@shared/types/archive'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'

export interface ArchiveRankingDayCell {
  dateStr: string | null
  isToday: boolean
  isFuture: boolean
  isSelected: boolean
}

export interface ArchiveRankingWeekOption {
  startDate: string
  endDate: string
  dateRangeLabel: string
  isCurrentWeek: boolean
  isFuture: boolean
  isSelected: boolean
}

export interface ArchiveRankingDependencies {
  now?: () => Date
  getListeningRanking: (params: ListeningRankingParams) => Promise<ListeningRanking>
}

export const archiveRankingRanges: Array<{ value: ListeningRankingRange; label: string }> = [
  { value: 'day', label: '日' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
]

export const archiveRankingTargets: Array<{
  value: ListeningRankingTarget
  label: string
  icon: string
}> = [
  { value: 'track', label: '单曲', icon: 'i-lucide-music-2' },
  { value: 'album', label: '专辑', icon: 'i-lucide-disc-3' },
]

export function formatArchiveDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function getArchiveWeekMonday(date: Date): string {
  const monday = new Date(date)
  const day = monday.getDay()
  monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day))
  return formatArchiveDateKey(monday)
}

export function addArchiveDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00`)
  date.setDate(date.getDate() + days)
  return formatArchiveDateKey(date)
}

export function formatArchiveMonthDay(dateStr: string): string {
  return `${Number(dateStr.slice(5, 7))}月${Number(dateStr.slice(8, 10))}日`
}

export function useArchiveRanking(
  selectedYear: Ref<number>,
  dependencies: ArchiveRankingDependencies,
) {
  const now = dependencies.now ?? (() => new Date())
  const getListeningRanking = dependencies.getListeningRanking
  const initialDate = now()
  const currentYear = initialDate.getFullYear()

  const listeningRanking = ref<ListeningRanking | null>(null)
  const rankingRange = ref<ListeningRankingRange>('day')
  const rankingTarget = ref<ListeningRankingTarget>('track')
  const rankingMonth = ref(initialDate.getMonth() + 1)
  const rankingDate = ref(formatArchiveDateKey(initialDate))
  const rankingWeekStartDate = ref(getArchiveWeekMonday(initialDate))
  const rankingYear = ref(currentYear)
  const rankingPickerYear = ref(currentYear)
  const rankingPickerMonth = ref(initialDate.getMonth() + 1)
  const isRankingLoading = ref(false)
  const rankingError = ref<string | null>(null)
  const showRankingPicker = ref(false)
  const pickerPos = ref({ top: 0, left: 0 })
  let rankingRequestId = 0

  const maxRankingMonth = computed(() =>
    rankingYear.value === currentYear ? now().getMonth() + 1 : 12,
  )
  const rankingMonthOptions = computed(() =>
    Array.from({ length: maxRankingMonth.value }, (_, index) => index + 1),
  )
  const rankingPeriodLabel = computed(() => {
    if (rankingRange.value === 'day') {
      return rankingDate.value === formatArchiveDateKey(now())
        ? '今天'
        : formatArchiveMonthDay(rankingDate.value)
    }
    if (rankingRange.value === 'week') {
      const currentMonday = getArchiveWeekMonday(now())
      if (rankingWeekStartDate.value === currentMonday) return '本周'
      return `${formatArchiveMonthDay(rankingWeekStartDate.value)} - ${formatArchiveMonthDay(
        addArchiveDays(rankingWeekStartDate.value, 6),
      )}`
    }
    if (rankingRange.value === 'month') return `${rankingYear.value}年${rankingMonth.value}月`
    return `${rankingYear.value}年`
  })

  const pickerCalendarDays = computed<ArchiveRankingDayCell[]>(() => {
    const year = rankingPickerYear.value
    const month = rankingPickerMonth.value
    const daysInMonth = new Date(year, month, 0).getDate()
    const startWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7
    const todayKey = formatArchiveDateKey(now())
    const cells: ArchiveRankingDayCell[] = Array.from({ length: startWeekday }, () => ({
      dateStr: null,
      isToday: false,
      isFuture: false,
      isSelected: false,
    }))

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      cells.push({
        dateStr,
        isToday: dateStr === todayKey,
        isFuture: dateStr > todayKey,
        isSelected: dateStr === rankingDate.value,
      })
    }
    return cells
  })

  const weekOptions = computed<ArchiveRankingWeekOption[]>(() => {
    const year = rankingPickerYear.value
    const todayKey = formatArchiveDateKey(now())
    const currentMonday = getArchiveWeekMonday(now())
    const weeks: ArchiveRankingWeekOption[] = []
    let cursor = getArchiveWeekMonday(new Date(year, 0, 1))
    const endOfYear = formatArchiveDateKey(new Date(year, 11, 31))

    while (cursor <= endOfYear) {
      const weekEnd = addArchiveDays(cursor, 6)
      const startYear = Number(cursor.slice(0, 4))
      const endYear = Number(weekEnd.slice(0, 4))
      weeks.push({
        startDate: cursor,
        endDate: weekEnd,
        dateRangeLabel:
          startYear !== endYear
            ? `${startYear}年${formatArchiveMonthDay(cursor)} - ${endYear}年${formatArchiveMonthDay(weekEnd)}`
            : `${formatArchiveMonthDay(cursor)} - ${formatArchiveMonthDay(weekEnd)}`,
        isCurrentWeek: cursor === currentMonday,
        isFuture: cursor > todayKey,
        isSelected: cursor === rankingWeekStartDate.value,
      })
      cursor = addArchiveDays(cursor, 7)
      if (new Date(`${cursor}T00:00:00`).getFullYear() > year) break
    }
    return weeks
  })

  function normalizeRankingPeriod(): void {
    if (rankingMonth.value > maxRankingMonth.value) {
      rankingMonth.value = maxRankingMonth.value
    }
  }

  function buildRankingParams(): ListeningRankingParams {
    const params: ListeningRankingParams = {
      range: rankingRange.value,
      target: rankingTarget.value,
    }
    if (rankingRange.value === 'day') params.date = rankingDate.value
    else if (rankingRange.value === 'week') params.weekStartDate = rankingWeekStartDate.value
    else if (rankingRange.value === 'month') {
      params.year = rankingYear.value
      params.month = rankingMonth.value
    } else params.year = rankingYear.value
    return params
  }

  async function loadListeningRanking(): Promise<void> {
    normalizeRankingPeriod()
    const requestId = ++rankingRequestId
    isRankingLoading.value = true
    rankingError.value = null

    try {
      const result = await getListeningRanking(buildRankingParams())
      if (requestId === rankingRequestId) listeningRanking.value = result
    } catch (error) {
      if (requestId === rankingRequestId) {
        rendererDiagnostics.error({
          scope: 'archive.ranking',
          message: 'Failed to load listening ranking',
          context: buildRankingParams(),
          cause: error,
        })
        rankingError.value = '无法读取听歌排行'
        listeningRanking.value = null
      }
    } finally {
      if (requestId === rankingRequestId) isRankingLoading.value = false
    }
  }

  function setRankingRange(range: ListeningRankingRange): void {
    if (rankingRange.value === range) return
    rankingRange.value = range
    showRankingPicker.value = false
    if (range === 'month' || range === 'year') rankingYear.value = selectedYear.value
    void loadListeningRanking()
  }

  function setRankingTarget(target: ListeningRankingTarget): void {
    if (rankingTarget.value === target) return
    rankingTarget.value = target
    void loadListeningRanking()
  }

  function selectRankingMonth(month: number): void {
    rankingMonth.value = month
    showRankingPicker.value = false
    void loadListeningRanking()
  }

  function selectRankingWeek(mondayStr: string): void {
    rankingWeekStartDate.value = mondayStr
    showRankingPicker.value = false
    void loadListeningRanking()
  }

  function handleCalendarCellClick(cell: ArchiveRankingDayCell): void {
    if (!cell.dateStr || cell.isFuture) return
    rankingDate.value = cell.dateStr
    showRankingPicker.value = false
    void loadListeningRanking()
  }

  function goToToday(): void {
    const date = now()
    rankingDate.value = formatArchiveDateKey(date)
    rankingPickerMonth.value = date.getMonth() + 1
    rankingPickerYear.value = date.getFullYear()
    showRankingPicker.value = false
    void loadListeningRanking()
  }

  function goToCurrentWeek(): void {
    const date = now()
    rankingWeekStartDate.value = getArchiveWeekMonday(date)
    rankingPickerYear.value = date.getFullYear()
    showRankingPicker.value = false
    void loadListeningRanking()
  }

  function navigatePickerMonth(delta: -1 | 1): void {
    let month = rankingPickerMonth.value + delta
    let year = rankingPickerYear.value
    if (month < 1) {
      month = 12
      year -= 1
    } else if (month > 12) {
      month = 1
      year += 1
    }
    const date = now()
    const currentMonth = date.getMonth() + 1
    if (year > date.getFullYear() || (year === date.getFullYear() && month > currentMonth)) return
    rankingPickerMonth.value = month
    rankingPickerYear.value = year
  }

  function navigatePickerYear(delta: -1 | 1): void {
    const nextYear = rankingPickerYear.value + delta
    if (nextYear < 1970 || nextYear > currentYear) return
    rankingPickerYear.value = nextYear
  }

  function changePickerYearBy(delta: -1 | 1): void {
    const nextYear = rankingYear.value + delta
    if (nextYear < 1970 || nextYear > currentYear) return
    rankingYear.value = nextYear
    normalizeRankingPeriod()
    void loadListeningRanking()
  }

  function toggleRankingPicker(event?: MouseEvent | KeyboardEvent): void {
    if (!showRankingPicker.value && event?.currentTarget) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
      pickerPos.value = { top: rect.top - 8, left: rect.right }
    }
    showRankingPicker.value = !showRankingPicker.value
  }

  return {
    listeningRanking,
    rankingRange,
    rankingTarget,
    rankingMonth,
    rankingDate,
    rankingWeekStartDate,
    rankingYear,
    rankingPickerYear,
    rankingPickerMonth,
    isRankingLoading,
    rankingError,
    showRankingPicker,
    pickerPos,
    rankingRanges: archiveRankingRanges,
    rankingTargets: archiveRankingTargets,
    maxRankingMonth,
    rankingMonthOptions,
    rankingPeriodLabel,
    pickerCalendarDays,
    weekOptions,
    loadListeningRanking,
    setRankingRange,
    setRankingTarget,
    selectRankingMonth,
    selectRankingWeek,
    handleCalendarCellClick,
    goToToday,
    goToCurrentWeek,
    navigatePickerMonth,
    navigatePickerYear,
    changePickerYearBy,
    toggleRankingPicker,
  }
}
