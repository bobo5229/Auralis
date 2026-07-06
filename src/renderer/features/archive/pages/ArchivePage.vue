<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { auralis } from '@renderer/shared/ipc/client'
import type {
  AnnualListeningInsights,
  DailyListeningDetail,
  ListeningHeatmap,
  ListeningRanking,
  ListeningRankingParams,
  ListeningRankingRange,
  ListeningRankingTarget,
} from '@shared/types/archive'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'

interface CalendarDay {
  date: string
  label: string
  playCount: number
  durationSeconds: number
  level: 0 | 1 | 2 | 3 | 4
  isFuture: boolean
}

interface HeatmapTooltip {
  text: string
  x: number
  y: number
}

const currentYear = new Date().getFullYear()
const selectedYear = ref(currentYear)
const heatmap = ref<ListeningHeatmap | null>(null)
const annualInsights = ref<AnnualListeningInsights | null>(null)
const annualInsightsError = ref(false)
const listeningRanking = ref<ListeningRanking | null>(null)
const rankingRange = ref<ListeningRankingRange>('day')
const rankingTarget = ref<ListeningRankingTarget>('track')
const rankingMonth = ref(new Date().getMonth() + 1)
const rankingQuarter = ref(Math.floor(new Date().getMonth() / 3) + 1)
const rankingDate = ref(formatDateKey(new Date()))
const rankingWeekStartDate = ref(getWeekMonday(new Date()))
const rankingYear = ref(currentYear)
const rankingPickerYear = ref(currentYear)
const rankingPickerMonth = ref(new Date().getMonth() + 1)
const isRankingLoading = ref(false)
const rankingError = ref<string | null>(null)
const showRankingPicker = ref(false)
const isLoading = ref(true)
const errorMessage = ref<string | null>(null)
const tooltip = ref<HeatmapTooltip | null>(null)
const dailyDetail = ref<DailyListeningDetail | null>(null)
const isDetailLoading = ref(false)
const detailError = ref<string | null>(null)
const detailDialog = ref<{
  date: string
  label: string
  x: number
  y: number
  expanded: boolean
} | null>(null)
const showResetAction = ref(false)
const showResetConfirmation = ref(false)
const isResetting = ref(false)
const isHoldingReset = ref(false)
const resetError = ref<string | null>(null)

const LONG_PRESS_MS = 1000
const RESET_HOLD_MS = 3000
const ARCHIVE_SCROLLBAR_HIDDEN_CLASS = 'archive-page-scrollbar-hidden'
const rankingRanges: Array<{ value: ListeningRankingRange; label: string }> = [
  { value: 'day', label: '日' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
  { value: 'quarter', label: '季' },
]
const rankingTargets: Array<{ value: ListeningRankingTarget; label: string }> = [
  { value: 'track', label: '单曲' },
  { value: 'album', label: '专辑' },
]
let longPressTimer: ReturnType<typeof window.setTimeout> | null = null
let resetHoldTimer: ReturnType<typeof window.setTimeout> | null = null
let rankingRequestId = 0
let unsubscribeLibraryChanged: (() => void) | null = null

const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function formatDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

function getIntensityLevel(playCount: number): CalendarDay['level'] {
  if (playCount >= 7) return 4
  if (playCount >= 4) return 3
  if (playCount >= 2) return 2
  if (playCount >= 1) return 1
  return 0
}

function getWeekMonday(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const offset = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + offset)
  return formatDateKey(d)
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  return formatDateKey(d)
}

function formatMonthDay(dateStr: string): string {
  const m = Number(dateStr.slice(5, 7))
  const d = Number(dateStr.slice(8, 10))
  return `${m}月${d}日`
}

const weekdayOrder = computed(() => {
  const firstWeekday = new Date(selectedYear.value, 0, 1).getDay()
  return Array.from({ length: 7 }, (_, index) => weekdayNames[(firstWeekday + index) % 7])
})

const calendarDays = computed<CalendarDay[]>(() => {
  const statsByDate = new Map((heatmap.value?.days ?? []).map((day) => [day.date, day] as const))
  const todayKey = formatDateKey(new Date())
  const daysInYear = new Date(selectedYear.value, 1, 29).getMonth() === 1 ? 366 : 365

  return Array.from({ length: daysInYear }, (_, index) => {
    const date = new Date(selectedYear.value, 0, index + 1)
    const dateKey = formatDateKey(date)
    const dayStats = statsByDate.get(dateKey)
    const playCount = dayStats?.playCount ?? 0

    return {
      date: dateKey,
      label: `${date.getMonth() + 1}月${date.getDate()}日`,
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
      label: `${month + 1}月`,
      column: Math.floor(elapsedDays / 7) + 1,
    }
    elapsedDays += new Date(selectedYear.value, month + 1, 0).getDate()
    return marker
  })
})

const firstAvailableYear = computed(() => heatmap.value?.firstRecordedYear ?? currentYear)
const canGoPrevious = computed(() => selectedYear.value > firstAvailableYear.value)
const canGoNext = computed(() => selectedYear.value < currentYear)
const maxRankingMonth = computed(() =>
  rankingYear.value === currentYear ? new Date().getMonth() + 1 : 12,
)
const maxRankingQuarter = computed(() => Math.ceil(maxRankingMonth.value / 3))
const rankingMonthOptions = computed(() =>
  Array.from({ length: maxRankingMonth.value }, (_, index) => index + 1),
)
const rankingQuarterOptions = computed(() =>
  Array.from({ length: maxRankingQuarter.value }, (_, index) => index + 1),
)
const rankingPeriodLabel = computed(() => {
  if (rankingRange.value === 'day') {
    const todayKey = formatDateKey(new Date())
    return rankingDate.value === todayKey ? '今天' : formatMonthDay(rankingDate.value)
  }
  if (rankingRange.value === 'week') {
    const currentMonday = getWeekMonday(new Date())
    if (rankingWeekStartDate.value === currentMonday) return '本周'
    const endDate = addDays(rankingWeekStartDate.value, 6)
    return `${formatMonthDay(rankingWeekStartDate.value)} - ${formatMonthDay(endDate)}`
  }
  if (rankingRange.value === 'month') return `${rankingYear.value}年${rankingMonth.value}月`
  return `${rankingYear.value}年 Q${rankingQuarter.value}`
})

interface PickerDayCell {
  dateStr: string | null
  isToday: boolean
  isFuture: boolean
  isSelected: boolean
}

const pickerCalendarDays = computed<PickerDayCell[]>(() => {
  const year = rankingPickerYear.value
  const month = rankingPickerMonth.value
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)
  const daysInMonth = lastDay.getDate()
  const startWeekday = (firstDay.getDay() + 6) % 7
  const todayKey = formatDateKey(new Date())
  const selectedKey = rankingDate.value
  const cells: PickerDayCell[] = []

  for (let i = 0; i < startWeekday; i++) {
    cells.push({ dateStr: null, isToday: false, isFuture: false, isSelected: false })
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    cells.push({
      dateStr,
      isToday: dateStr === todayKey,
      isFuture: dateStr > todayKey,
      isSelected: dateStr === selectedKey,
    })
  }

  return cells
})

const weekOptions = computed(() => {
  const year = rankingPickerYear.value
  const todayKey = formatDateKey(new Date())
  const currentMonday = getWeekMonday(new Date())
  const weeks: Array<{
    startDate: string
    endDate: string
    dateRangeLabel: string
    isCurrentWeek: boolean
    isFuture: boolean
    isSelected: boolean
  }> = []
  let cursor = getWeekMonday(new Date(year, 0, 1))
  const endOfYear = formatDateKey(new Date(year, 11, 31))

  while (cursor <= endOfYear) {
    const weekEnd = addDays(cursor, 6)
    const startYear = Number(cursor.slice(0, 4))
    const endYear = Number(weekEnd.slice(0, 4))
    const showYear = startYear !== endYear
    const dateRangeLabel = showYear
      ? `${startYear}年${formatMonthDay(cursor)} - ${endYear}年${formatMonthDay(weekEnd)}`
      : `${formatMonthDay(cursor)} - ${formatMonthDay(weekEnd)}`
    weeks.push({
      startDate: cursor,
      endDate: weekEnd,
      dateRangeLabel,
      isCurrentWeek: cursor === currentMonday,
      isFuture: cursor > todayKey,
      isSelected: cursor === rankingWeekStartDate.value,
    })
    cursor = addDays(cursor, 7)
    const cursorDate = new Date(`${cursor}T00:00:00`)
    if (cursorDate.getFullYear() > year) break
  }

  return weeks
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
const annualSummary = computed(() => {
  const elapsedDays = calendarDays.value.filter((day) => !day.isFuture)
  const listeningDays = elapsedDays.filter((day) => day.playCount > 0).length
  const totalPlays = elapsedDays.reduce((total, day) => total + day.playCount, 0)
  const totalDurationSeconds = elapsedDays.reduce((total, day) => total + day.durationSeconds, 0)
  const totalMinutes = Math.round(totalDurationSeconds / 60)
  let longestStreak = 0
  let currentStreak = 0
  const activeDaysByMonth = Array.from({ length: 12 }, () => 0)

  for (const day of elapsedDays) {
    if (day.playCount > 0) {
      currentStreak += 1
      longestStreak = Math.max(longestStreak, currentStreak)
      activeDaysByMonth[Number(day.date.slice(5, 7)) - 1] += 1
    } else {
      currentStreak = 0
    }
  }

  const mostActiveMonthIndex = activeDaysByMonth.reduce(
    (bestIndex, count, index, counts) => (count > counts[bestIndex] ? index : bestIndex),
    0,
  )
  const longestListeningDay = elapsedDays.reduce<CalendarDay | null>((longest, day) => {
    if (day.durationSeconds <= 0) return longest
    if (!longest || day.durationSeconds > longest.durationSeconds) return day
    return longest
  }, null)
  const activeRate = elapsedDays.length ? Math.round((listeningDays / elapsedDays.length) * 100) : 0
  const averagePlays = listeningDays ? (totalPlays / listeningDays).toFixed(1) : '0.0'
  const averageMinutes = listeningDays
    ? (totalDurationSeconds / 60 / listeningDays).toFixed(1)
    : '0.0'
  const topTrack = annualInsights.value?.topTrack
  const peakInsights = annualInsights.value?.peakDay
  const insightFallback = annualInsightsError.value ? '暂无详细数据' : '暂无歌曲明细'

  return [
    {
      key: 'listeningDays',
      label: '听歌天数',
      value: `${listeningDays}`,
      unit: '天',
      details: [
        `年度活跃率 · ${listeningDays} / ${elapsedDays.length} 天 · ${activeRate}%`,
        `最长连续聆听 · ${longestStreak} 天`,
        listeningDays
          ? `最活跃月份 · ${mostActiveMonthIndex + 1} 月 · ${activeDaysByMonth[mostActiveMonthIndex]} 天`
          : '最活跃月份 · 暂无记录',
      ],
    },
    {
      key: 'plays',
      label: '播放次数',
      value: `${totalPlays}`,
      unit: '次',
      details: [
        `平均每个听歌日 · ${averagePlays} 次`,
        `单日最高 · ${peakDay.value?.playCount ?? 0} 次`,
        topTrack
          ? `年度最常听 · ${topTrack.title || '未知歌曲'} · ${topTrack.playCount} 次`
          : insightFallback,
      ],
    },
    {
      key: 'duration',
      label: '已收听',
      value: `${totalMinutes}`,
      unit: '分钟',
      details: [
        `累计时长 · ${formatHoursAndMinutes(totalDurationSeconds)}`,
        `平均每个听歌日 · ${averageMinutes} 分钟`,
        longestListeningDay
          ? `收听最久 · ${longestListeningDay.label} · ${formatMinutes(longestListeningDay.durationSeconds)}`
          : '收听最久 · 暂无记录',
      ],
    },
    {
      key: 'peakDay',
      label: '最活跃的一天',
      value: peakDay.value?.label ?? '暂无记录',
      unit: peakDay.value ? `${peakDay.value.playCount} 次` : '',
      clickable: Boolean(peakDay.value),
      details: [
        `收听时长 · ${formatMinutes(peakDay.value?.durationSeconds ?? 0)}`,
        peakInsights ? `不同歌曲 · ${peakInsights.uniqueTrackCount} 首` : insightFallback,
        peakInsights?.topTracks.length
          ? `Top 3 · ${peakInsights.topTracks.map((track) => track.title || '未知歌曲').join('、')}`
          : insightFallback,
      ],
    },
  ]
})

async function loadHeatmap(): Promise<void> {
  isLoading.value = true
  errorMessage.value = null
  annualInsights.value = null
  annualInsightsError.value = false
  tooltip.value = null

  const year = selectedYear.value
  const [heatmapResult, insightsResult] = await Promise.allSettled([
    auralis.archive.getListeningHeatmap(year),
    auralis.archive.getAnnualListeningInsights(year),
  ])

  if (heatmapResult.status === 'fulfilled') {
    heatmap.value = heatmapResult.value
  } else {
    errorMessage.value =
      heatmapResult.reason instanceof Error ? heatmapResult.reason.message : '无法读取听歌记录'
  }

  if (insightsResult.status === 'fulfilled') {
    annualInsights.value = insightsResult.value
  } else {
    annualInsightsError.value = true
  }

  isLoading.value = false
}

function normalizeRankingPeriod(): void {
  if (rankingMonth.value > maxRankingMonth.value) {
    rankingMonth.value = maxRankingMonth.value
  }
  if (rankingQuarter.value > maxRankingQuarter.value) {
    rankingQuarter.value = maxRankingQuarter.value
  }
}

async function loadListeningRanking(): Promise<void> {
  normalizeRankingPeriod()
  const requestId = ++rankingRequestId
  isRankingLoading.value = true
  rankingError.value = null

  try {
    const params: ListeningRankingParams = {
      range: rankingRange.value,
      target: rankingTarget.value,
    }
    if (rankingRange.value === 'day') {
      params.date = rankingDate.value
    } else if (rankingRange.value === 'week') {
      params.weekStartDate = rankingWeekStartDate.value
    } else if (rankingRange.value === 'month') {
      params.year = rankingYear.value
      params.month = rankingMonth.value
    } else if (rankingRange.value === 'quarter') {
      params.year = rankingYear.value
      params.quarter = rankingQuarter.value
    }
    const result = await auralis.archive.getListeningRanking(params)
    if (requestId === rankingRequestId) {
      listeningRanking.value = result
    }
  } catch (error) {
    if (requestId === rankingRequestId) {
      rankingError.value = error instanceof Error ? error.message : '无法读取听歌排行'
      listeningRanking.value = null
    }
  } finally {
    if (requestId === rankingRequestId) {
      isRankingLoading.value = false
    }
  }
}

function setRankingRange(range: ListeningRankingRange): void {
  if (rankingRange.value === range) return
  rankingRange.value = range
  showRankingPicker.value = false
  if (range === 'month' || range === 'quarter') {
    rankingYear.value = selectedYear.value
  }
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

function selectRankingQuarter(quarter: number): void {
  rankingQuarter.value = quarter
  showRankingPicker.value = false
  void loadListeningRanking()
}

function selectRankingWeek(mondayStr: string): void {
  rankingWeekStartDate.value = mondayStr
  showRankingPicker.value = false
  void loadListeningRanking()
}

function handleCalendarCellClick(cell: PickerDayCell): void {
  if (!cell.dateStr || cell.isFuture) return
  rankingDate.value = cell.dateStr
  showRankingPicker.value = false
  void loadListeningRanking()
}

function goToToday(): void {
  rankingDate.value = formatDateKey(new Date())
  rankingPickerMonth.value = new Date().getMonth() + 1
  rankingPickerYear.value = currentYear
  showRankingPicker.value = false
  void loadListeningRanking()
}

function goToCurrentWeek(): void {
  rankingWeekStartDate.value = getWeekMonday(new Date())
  rankingPickerYear.value = currentYear
  showRankingPicker.value = false
  void loadListeningRanking()
}

function navigatePickerMonth(delta: -1 | 1): void {
  let month = rankingPickerMonth.value + delta
  let year = rankingPickerYear.value
  if (month < 1) {
    month = 12
    year--
  } else if (month > 12) {
    month = 1
    year++
  }
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  if (year > currentYear || (year === currentYear && month > currentMonth)) return
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

function toggleRankingPicker(): void {
  showRankingPicker.value = !showRankingPicker.value
}

async function changeYear(offset: -1 | 1): Promise<void> {
  const nextYear = selectedYear.value + offset
  if (nextYear < firstAvailableYear.value || nextYear > currentYear) return

  selectedYear.value = nextYear
  normalizeRankingPeriod()
  await loadHeatmap()
  await loadListeningRanking()
}

function updateTooltipPosition(event: MouseEvent): void {
  if (!tooltip.value) return
  tooltip.value = {
    ...tooltip.value,
    x: event.clientX,
    y: event.clientY,
  }
}

function showTooltip(event: MouseEvent | FocusEvent, day: CalendarDay): void {
  const countLabel = day.isFuture ? '未来日期' : `播放了 ${formatMinutes(day.durationSeconds)}`
  const targetRect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  tooltip.value = {
    text: `${day.label} · ${countLabel}`,
    x: event instanceof MouseEvent ? event.clientX : targetRect.left + targetRect.width / 2,
    y: event instanceof MouseEvent ? event.clientY : targetRect.top,
  }
}

function hideTooltip(): void {
  tooltip.value = null
}

function formatMinutes(durationSeconds: number): string {
  if (durationSeconds > 0 && durationSeconds < 60) return '不到 1 分钟'
  return `${Math.round(durationSeconds / 60)} 分钟`
}

function formatHoursAndMinutes(durationSeconds: number): string {
  if (durationSeconds > 0 && durationSeconds < 60) return '不到 1 分钟'
  const totalMinutes = Math.round(durationSeconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (!hours) return `${minutes} 分钟`
  if (!minutes) return `${hours} 小时`
  return `${hours} 小时 ${minutes} 分钟`
}

async function openDailyDetail(event: MouseEvent | KeyboardEvent, day: CalendarDay): Promise<void> {
  if (day.isFuture) return

  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  tooltip.value = null
  dailyDetail.value = null
  detailError.value = null
  isDetailLoading.value = true
  detailDialog.value = {
    date: day.date,
    label: day.label,
    x: rect.left + rect.width / 2,
    y: rect.top,
    expanded: false,
  }

  await nextTick()
  requestAnimationFrame(() => {
    if (detailDialog.value?.date === day.date) {
      detailDialog.value.expanded = true
    }
  })

  try {
    dailyDetail.value = await auralis.archive.getDailyListeningDetail(day.date)
  } catch (error) {
    detailError.value = error instanceof Error ? error.message : '无法读取当日播放记录'
  } finally {
    isDetailLoading.value = false
  }
}

function activateSummaryItem(event: MouseEvent | KeyboardEvent, key: string): void {
  if (key !== 'peakDay' || !peakDay.value) return
  if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return
  if (event instanceof KeyboardEvent) event.preventDefault()
  void openDailyDetail(event, peakDay.value)
}

function dismissSummaryPopover(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    const target = event.currentTarget as HTMLElement
    target.blur()
  }
}

function closeDailyDetail(): void {
  if (!detailDialog.value) return
  detailDialog.value.expanded = false
  window.setTimeout(() => {
    detailDialog.value = null
    dailyDetail.value = null
    detailError.value = null
  }, 240)
}

function cancelLongPress(): void {
  if (longPressTimer !== null) {
    window.clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

function startLongPress(): void {
  if (longPressTimer !== null || showResetAction.value) return
  longPressTimer = window.setTimeout(() => {
    showResetAction.value = true
    longPressTimer = null
  }, LONG_PRESS_MS)
}

function handleTitleKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  startLongPress()
}

function handleTitleKeyUp(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ' ') cancelLongPress()
}

function handleDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Element)) return
  if (!target.closest('[data-reset-control]')) {
    showResetAction.value = false
  }
  if (!target.closest('[data-ranking-period-control]')) {
    showRankingPicker.value = false
  }
}

function openResetConfirmation(): void {
  showResetAction.value = false
  resetError.value = null
  showResetConfirmation.value = true
}

function closeResetConfirmation(): void {
  if (isResetting.value) return
  cancelResetHold()
  showResetConfirmation.value = false
  resetError.value = null
}

function startResetHold(): void {
  if (isResetting.value || isHoldingReset.value || resetHoldTimer !== null) return
  isHoldingReset.value = true
  resetHoldTimer = window.setTimeout(() => {
    resetHoldTimer = null
    isHoldingReset.value = false
    void resetAllPlayStats()
  }, RESET_HOLD_MS)
}

function cancelResetHold(): void {
  if (resetHoldTimer !== null) {
    window.clearTimeout(resetHoldTimer)
    resetHoldTimer = null
  }
  isHoldingReset.value = false
}

function handleResetKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  startResetHold()
}

function handleResetKeyUp(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ' ') cancelResetHold()
}

async function resetAllPlayStats(): Promise<void> {
  if (isResetting.value) return
  isResetting.value = true
  resetError.value = null

  try {
    await auralis.archive.resetPlayStats()
    tooltip.value = null
    detailDialog.value = null
    dailyDetail.value = null
    selectedYear.value = currentYear
    showResetConfirmation.value = false
    await loadHeatmap()
    await loadListeningRanking()
  } catch (error) {
    resetError.value = error instanceof Error ? error.message : '无法重置播放数据'
  } finally {
    isResetting.value = false
  }
}

onMounted(() => {
  document.body.classList.add(ARCHIVE_SCROLLBAR_HIDDEN_CLASS)
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  void loadHeatmap()
  void loadListeningRanking()
  unsubscribeLibraryChanged = auralis.library.onChanged((event) => {
    if (event.reason !== 'play-stats-updated' && event.reason !== 'play-stats-reset') return
    void loadHeatmap()
    void loadListeningRanking()
  })
})

onBeforeUnmount(() => {
  cancelLongPress()
  cancelResetHold()
  unsubscribeLibraryChanged?.()
  document.body.classList.remove(ARCHIVE_SCROLLBAR_HIDDEN_CLASS)
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
})
</script>

<template>
  <section class="archive-page content-frame">
    <div class="archive-heading">
      <div>
        <div class="archive-title-row" data-reset-control>
          <h1
            role="button"
            tabindex="0"
            aria-label="声迹，长按一秒显示播放数据重置操作"
            @pointerdown="startLongPress"
            @pointerup="cancelLongPress"
            @pointerleave="cancelLongPress"
            @pointercancel="cancelLongPress"
            @keydown="handleTitleKeyDown"
            @keyup="handleTitleKeyUp"
            @blur="cancelLongPress"
            @contextmenu.prevent
          >
            声迹
          </h1>
          <Transition name="archive-reset-action">
            <button
              v-if="showResetAction"
              type="button"
              class="archive-reset-action"
              @click="openResetConfirmation"
            >
              重置播放数据
            </button>
          </Transition>
        </div>
        <p>回望每一天留下的聆听痕迹。</p>
      </div>
      <div class="archive-year-switcher" aria-label="选择年份">
        <button
          type="button"
          :disabled="!canGoPrevious || isLoading"
          aria-label="上一年"
          @click="changeYear(-1)"
        >
          <span class="i-lucide-chevron-left h-4 w-4"></span>
        </button>
        <span>{{ selectedYear }}年</span>
        <button
          type="button"
          :disabled="!canGoNext || isLoading"
          aria-label="下一年"
          @click="changeYear(1)"
        >
          <span class="i-lucide-chevron-right h-4 w-4"></span>
        </button>
      </div>
    </div>

    <div class="archive-heatmap-card">
      <div class="archive-card-heading">
        <div>
          <h2>音乐日历</h2>
        </div>
        <div class="archive-legend" aria-label="播放次数颜色图例">
          <span>少</span>
          <i v-for="level in 5" :key="level" :class="`heat-level-${level - 1}`"></i>
          <span>多</span>
        </div>
      </div>

      <div v-if="isLoading" class="archive-state">正在读取听歌记录…</div>
      <div v-else-if="errorMessage" class="archive-state archive-state--error">
        {{ errorMessage }}
      </div>
      <div v-else class="archive-heatmap-scroll">
        <div class="archive-heatmap-layout">
          <div class="archive-month-spacer"></div>
          <div class="archive-months">
            <span
              v-for="month in monthMarkers"
              :key="month.label"
              :style="{ gridColumn: month.column }"
              >{{ month.label }}</span
            >
          </div>

          <div class="archive-weekdays">
            <span v-for="weekday in weekdayOrder" :key="weekday">{{ weekday }}</span>
          </div>
          <div class="archive-days" role="grid" :aria-label="`${selectedYear}年听歌热力图`">
            <button
              v-for="day in calendarDays"
              :key="day.date"
              type="button"
              class="archive-day"
              :class="[`heat-level-${day.level}`, { 'archive-day--future': day.isFuture }]"
              :aria-label="`${day.label}，${day.isFuture ? '未来日期' : `播放了${formatMinutes(day.durationSeconds)}`}`"
              @mouseenter="showTooltip($event, day)"
              @mousemove="updateTooltipPosition"
              @mouseleave="hideTooltip"
              @focus="showTooltip($event, day)"
              @blur="hideTooltip"
              @click="openDailyDetail($event, day)"
            ></button>
          </div>
        </div>
      </div>
    </div>

    <section v-if="!isLoading && !errorMessage" class="archive-summary">
      <h2>年度摘要</h2>
      <div class="archive-summary-grid">
        <div
          v-for="item in annualSummary"
          :key="item.key"
          class="archive-summary-item"
          :class="{
            'archive-summary-item--clickable': item.clickable,
            'archive-summary-item--peak-day': item.key === 'peakDay',
          }"
          tabindex="0"
          :role="item.clickable ? 'button' : undefined"
          @click="activateSummaryItem($event, item.key)"
          @keydown="activateSummaryItem($event, item.key)"
          @keydown.esc="dismissSummaryPopover"
        >
          <span class="archive-summary-label">{{ item.label }}</span>
          <div class="archive-summary-value">
            <strong>{{ item.value }}</strong>
            <span v-if="item.unit">{{ item.unit }}</span>
          </div>
          <div class="archive-summary-expanded">
            <div class="archive-summary-expanded-main">
              <span class="archive-summary-label">{{ item.label }}</span>
              <div class="archive-summary-value">
                <strong>{{ item.value }}</strong>
                <span v-if="item.unit">{{ item.unit }}</span>
              </div>
            </div>
            <div class="archive-summary-details">
              <span v-for="detail in item.details" :key="detail">{{ detail }}</span>
              <small v-if="item.clickable">点击查看完整 Top 10</small>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="!isLoading && !errorMessage" class="archive-ranking">
      <div class="archive-ranking-heading">
        <div>
          <h2>听歌排行</h2>
          <p>{{ rankingPeriodLabel }} · {{ rankingTarget === 'track' ? '单曲榜' : '专辑榜' }}</p>
        </div>
        <div class="archive-ranking-ranges" aria-label="切换排行范围">
          <button
            v-for="range in rankingRanges"
            :key="range.value"
            type="button"
            :class="{ 'is-active': rankingRange === range.value }"
            @click="setRankingRange(range.value)"
          >
            {{ range.label }}
          </button>
        </div>
      </div>

      <div class="archive-ranking-toolbar">
        <div class="archive-ranking-targets" aria-label="切换排行类型">
          <button
            v-for="target in rankingTargets"
            :key="target.value"
            type="button"
            :class="{ 'is-active': rankingTarget === target.value }"
            @click="setRankingTarget(target.value)"
          >
            {{ target.label }}
          </button>
        </div>

        <div class="archive-ranking-period" data-ranking-period-control>
          <button type="button" @click="toggleRankingPicker">
            <span>{{ rankingPeriodLabel }}</span>
            <span class="i-lucide-chevron-down h-3.5 w-3.5"></span>
          </button>

          <div v-if="showRankingPicker" class="archive-ranking-picker">
            <!-- Day: Mini calendar -->
            <template v-if="rankingRange === 'day'">
              <div class="picker-header">
                <button
                  type="button"
                  :disabled="rankingPickerYear <= 1970 && rankingPickerMonth === 1"
                  @click="navigatePickerMonth(-1)"
                >
                  <span class="i-lucide-chevron-left h-3.5 w-3.5"></span>
                </button>
                <span>{{ rankingPickerYear }}年{{ rankingPickerMonth }}月</span>
                <button
                  type="button"
                  :disabled="
                    rankingPickerYear >= currentYear &&
                    rankingPickerMonth >= new Date().getMonth() + 1
                  "
                  @click="navigatePickerMonth(1)"
                >
                  <span class="i-lucide-chevron-right h-3.5 w-3.5"></span>
                </button>
              </div>
              <div class="picker-calendar">
                <div class="calendar-weekdays">
                  <span v-for="wd in ['一', '二', '三', '四', '五', '六', '日']" :key="wd">{{
                    wd
                  }}</span>
                </div>
                <div class="calendar-grid">
                  <button
                    v-for="(cell, idx) in pickerCalendarDays"
                    :key="idx"
                    type="button"
                    :disabled="!cell.dateStr || cell.isFuture"
                    :class="{
                      'is-today': cell.isToday,
                      'is-selected': cell.isSelected,
                      'is-empty': !cell.dateStr,
                    }"
                    @click="handleCalendarCellClick(cell)"
                  >
                    {{ cell.dateStr ? Number(cell.dateStr.slice(8, 10)) : '' }}
                  </button>
                </div>
              </div>
              <button type="button" class="picker-today-btn" @click="goToToday">回到今天</button>
            </template>

            <!-- Week: Week list -->
            <template v-else-if="rankingRange === 'week'">
              <div class="picker-header">
                <button
                  type="button"
                  :disabled="rankingPickerYear <= 1970"
                  @click="navigatePickerYear(-1)"
                >
                  <span class="i-lucide-chevron-left h-3.5 w-3.5"></span>
                </button>
                <span>{{ rankingPickerYear }}年</span>
                <button
                  type="button"
                  :disabled="rankingPickerYear >= currentYear"
                  @click="navigatePickerYear(1)"
                >
                  <span class="i-lucide-chevron-right h-3.5 w-3.5"></span>
                </button>
              </div>
              <div class="picker-week-list">
                <button
                  v-for="week in weekOptions"
                  :key="week.startDate"
                  type="button"
                  :disabled="week.isFuture"
                  :class="{ 'is-active': week.isSelected, 'is-current': week.isCurrentWeek }"
                  @click="!week.isFuture ? selectRankingWeek(week.startDate) : undefined"
                >
                  <span v-if="week.isCurrentWeek" class="week-current-label">本周</span>
                  <span v-else class="week-date-range">{{ week.dateRangeLabel }}</span>
                </button>
              </div>
              <button type="button" class="picker-today-btn" @click="goToCurrentWeek">
                回到本周
              </button>
            </template>

            <!-- Month / Quarter: lightweight list -->
            <template v-else>
              <div class="picker-header">
                <button
                  type="button"
                  :disabled="rankingYear <= 1970"
                  @click="changePickerYearBy(-1)"
                >
                  <span class="i-lucide-chevron-left h-3.5 w-3.5"></span>
                </button>
                <span>{{ rankingYear }}年</span>
                <button
                  type="button"
                  :disabled="rankingYear >= currentYear"
                  @click="changePickerYearBy(1)"
                >
                  <span class="i-lucide-chevron-right h-3.5 w-3.5"></span>
                </button>
              </div>
              <div class="picker-list">
                <button
                  v-for="month in rankingRange === 'month' ? rankingMonthOptions : []"
                  :key="`month-${month}`"
                  type="button"
                  :class="{ 'is-active': rankingMonth === month }"
                  @click="selectRankingMonth(month)"
                >
                  {{ month }}月
                </button>
                <button
                  v-for="quarter in rankingRange === 'quarter' ? rankingQuarterOptions : []"
                  :key="`quarter-${quarter}`"
                  type="button"
                  :class="{ 'is-active': rankingQuarter === quarter }"
                  @click="selectRankingQuarter(quarter)"
                >
                  Q{{ quarter }}
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div v-if="isRankingLoading" class="archive-ranking-state">正在整理排行…</div>
      <div v-else-if="rankingError" class="archive-ranking-state archive-state--error">
        {{ rankingError }}
      </div>
      <div v-else-if="!listeningRanking?.items.length" class="archive-ranking-state">
        暂无排行数据
      </div>
      <ol v-else class="archive-ranking-list">
        <li v-for="(item, index) in listeningRanking.items" :key="item.key">
          <span class="archive-ranking-rank">{{ index + 1 }}</span>
          <div class="archive-ranking-artwork">
            <img
              v-if="getArtworkUrl(item.artworkCacheKey)"
              :src="getArtworkUrl(item.artworkCacheKey) ?? undefined"
              alt=""
            />
            <span v-else class="i-lucide-music-2 h-4 w-4"></span>
          </div>
          <div class="archive-ranking-copy">
            <strong>
              {{ item.title || (rankingTarget === 'track' ? '未知歌曲' : '未知专辑') }}
            </strong>
            <span>{{ item.artist || '未知艺术家' }}</span>
          </div>
          <div class="archive-ranking-meta">
            <strong>{{ item.playCount }} 次</strong>
            <span>{{ formatMinutes(item.durationSeconds) }}</span>
          </div>
        </li>
      </ol>
    </section>

    <Teleport to="body">
      <div
        v-if="tooltip"
        class="archive-tooltip"
        :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
      >
        {{ tooltip.text }}
      </div>

      <div
        v-if="detailDialog"
        class="archive-detail-backdrop"
        :class="{ 'is-visible': detailDialog.expanded }"
        @click.self="closeDailyDetail"
      >
        <section
          class="archive-detail-dialog"
          :class="{ 'is-expanded': detailDialog.expanded }"
          :style="{
            '--dialog-origin-x': `${detailDialog.x}px`,
            '--dialog-origin-y': `${detailDialog.y}px`,
          }"
          role="dialog"
          aria-modal="true"
          :aria-label="`${detailDialog.label}播放排行`"
        >
          <header class="archive-detail-header">
            <div>
              <span>{{ detailDialog.label }}</span>
              <h2>当日播放 Top 10</h2>
              <p v-if="dailyDetail">
                {{ dailyDetail.totalPlayCount }} 次播放 ·
                {{ formatMinutes(dailyDetail.totalDurationSeconds) }}
              </p>
            </div>
            <button type="button" aria-label="关闭" @click="closeDailyDetail">
              <span class="i-lucide-x h-4 w-4"></span>
            </button>
          </header>

          <div v-if="isDetailLoading" class="archive-detail-state">正在整理这一天的声迹…</div>
          <div v-else-if="detailError" class="archive-detail-state">{{ detailError }}</div>
          <ol v-else-if="dailyDetail?.tracks.length" class="archive-top-tracks">
            <li v-for="(track, index) in dailyDetail.tracks" :key="track.trackId">
              <span class="archive-track-rank">{{ index + 1 }}</span>
              <div class="archive-track-artwork">
                <img
                  v-if="getArtworkUrl(track.artworkCacheKey)"
                  :src="getArtworkUrl(track.artworkCacheKey) ?? undefined"
                  alt=""
                />
                <span v-else class="i-lucide-music-2 h-4 w-4"></span>
              </div>
              <div class="archive-track-copy">
                <strong>{{ track.title || '未知歌曲' }}</strong>
                <span>{{ track.artist || '未知艺人' }}</span>
              </div>
              <span class="archive-track-count">{{ track.playCount }} 次</span>
            </li>
          </ol>
          <div v-else class="archive-detail-state">
            <span class="i-lucide-calendar-clock h-6 w-6"></span>
            <p>这一天还没有可用的歌曲明细</p>
          </div>
        </section>
      </div>

      <div
        v-if="showResetConfirmation"
        class="archive-reset-backdrop"
        @click.self="closeResetConfirmation"
      >
        <section
          class="archive-reset-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="archive-reset-title"
          aria-describedby="archive-reset-description"
        >
          <h2 id="archive-reset-title">确认重置播放数据？</h2>
          <p id="archive-reset-description">
            此操作会永久删除所有累计播放次数、每日分钟数、音乐日历和 Top
            10，且无法恢复。音乐文件、标签、封面和歌词不会受到影响。
          </p>
          <p v-if="resetError" class="archive-reset-error">{{ resetError }}</p>
          <div class="archive-reset-buttons">
            <button type="button" :disabled="isResetting" @click="closeResetConfirmation">
              取消
            </button>
            <div class="archive-reset-confirm-wrap">
              <button
                type="button"
                class="archive-reset-confirm"
                :class="{ 'is-holding': isHoldingReset }"
                :disabled="isResetting"
                @pointerdown.prevent="startResetHold"
                @pointerup="cancelResetHold"
                @pointerleave="cancelResetHold"
                @pointercancel="cancelResetHold"
                @keydown="handleResetKeyDown"
                @keyup="handleResetKeyUp"
                @blur="cancelResetHold"
                @click.prevent
                @contextmenu.prevent
              >
                <span>{{ isResetting ? '重置中…' : '重置' }}</span>
              </button>
              <span v-if="!isResetting" class="archive-reset-hint">按住 3 秒重置</span>
            </div>
          </div>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.archive-page {
  min-height: 100%;
  padding-bottom: var(--auralis-playbar-safe-area);
}

:global(body.archive-page-scrollbar-hidden .app-main) {
  scrollbar-width: none;
}

:global(body.archive-page-scrollbar-hidden .app-main::-webkit-scrollbar) {
  display: none;
}

.archive-heading,
.archive-card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.archive-heading h1 {
  color: var(--auralis-text);
  font-size: 30px;
  font-weight: 650;
  line-height: 1.2;
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.archive-heading h1:focus-visible {
  border-radius: 5px;
  outline: 2px solid color-mix(in srgb, var(--auralis-sidebar-active-indicator) 58%, transparent);
  outline-offset: 4px;
}

.archive-title-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.archive-reset-action {
  color: #d94a4a;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  transition:
    color 150ms ease,
    opacity 150ms ease;
}

.archive-reset-action:hover {
  color: #bf3030;
}

.archive-reset-action-enter-active,
.archive-reset-action-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.archive-reset-action-enter-from,
.archive-reset-action-leave-to {
  opacity: 0;
  transform: translateX(-6px);
}

.archive-heading p,
.archive-card-heading p {
  margin-top: 6px;
  color: var(--auralis-text-muted);
  font-size: 13px;
}

.archive-year-switcher {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--auralis-text);
  font-size: 14px;
  font-weight: 650;
}

.archive-year-switcher button {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  color: var(--auralis-text-muted);
  transition:
    color 160ms ease,
    background-color 160ms ease;
}

.archive-year-switcher button:hover:not(:disabled) {
  color: var(--auralis-text);
  background: var(--auralis-control-hover-bg);
}

.archive-year-switcher button:disabled {
  opacity: 0.35;
}

.archive-heatmap-card {
  margin-top: 28px;
  padding: 0;
}

.archive-card-heading h2 {
  color: var(--auralis-text);
  font-size: 17px;
  font-weight: 650;
}

.archive-legend {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--auralis-text-faint);
  font-size: 11px;
}

.archive-legend i {
  width: 11px;
  height: 11px;
  border-radius: 3px;
}

.archive-state {
  display: flex;
  min-height: 160px;
  align-items: center;
  justify-content: center;
  color: var(--auralis-text-muted);
  font-size: 13px;
}

.archive-state--error {
  color: var(--auralis-text);
}

.archive-heatmap-scroll {
  margin-top: 24px;
  overflow-x: auto;
  padding: 0 2px 8px;
}

.archive-heatmap-layout {
  display: grid;
  width: 100%;
  min-width: 830px;
  grid-template-columns: 38px minmax(0, 1fr);
  grid-template-rows: 18px auto;
  gap: 7px 8px;
}

.archive-month-spacer {
  grid-column: 1;
  grid-row: 1;
}

.archive-months {
  display: grid;
  grid-column: 2;
  grid-row: 1;
  grid-auto-columns: 12px;
  grid-template-columns: repeat(53, 12px);
  column-gap: 3px;
  justify-content: space-between;
}

.archive-months span {
  color: var(--auralis-text-faint);
  font-size: 10px;
  white-space: nowrap;
}

.archive-weekdays {
  display: grid;
  grid-column: 1;
  grid-row: 2;
  grid-template-rows: repeat(7, 12px);
  row-gap: 3px;
}

.archive-weekdays span {
  color: var(--auralis-text-faint);
  font-size: 10px;
  line-height: 12px;
}

.archive-days {
  display: grid;
  grid-column: 2;
  grid-row: 2;
  grid-auto-flow: column;
  grid-template-columns: repeat(53, 12px);
  grid-template-rows: repeat(7, 12px);
  justify-content: space-between;
  row-gap: 3px;
}

.archive-day {
  width: 12px;
  height: 12px;
  padding: 0;
  border-radius: 3px;
  transition:
    transform 120ms ease,
    box-shadow 120ms ease;
}

.archive-day:hover,
.archive-day:focus-visible {
  z-index: 1;
  box-shadow: 0 0 0 2px var(--auralis-main-bg);
  transform: scale(1.22);
}

.heat-level-0 {
  background: var(--auralis-control-hover-bg);
}

.heat-level-1 {
  background: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 32%, transparent);
}

.heat-level-2 {
  background: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 52%, transparent);
}

.heat-level-3 {
  background: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 74%, transparent);
}

.heat-level-4 {
  background: var(--auralis-sidebar-active-indicator);
}

.archive-day--future {
  opacity: 0.38;
}

.archive-summary {
  margin-top: 42px;
}

.archive-summary h2 {
  color: var(--auralis-text);
  font-size: 17px;
  font-weight: 650;
}

.archive-summary-grid {
  display: grid;
  margin-top: 16px;
  border-top: 1px solid var(--auralis-border-subtle);
  border-bottom: 1px solid var(--auralis-border-subtle);
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.archive-summary-item {
  position: relative;
  z-index: 0;
  min-width: 0;
  padding: 22px 20px;
  outline: none;
}

.archive-summary-item:hover,
.archive-summary-item:focus-within {
  z-index: 20;
}

.archive-summary-item:focus-visible {
  box-shadow: inset 0 0 0 2px
    color-mix(in srgb, var(--auralis-sidebar-active-indicator) 42%, transparent);
}

.archive-summary-item--clickable {
  cursor: pointer;
}

.archive-summary-item + .archive-summary-item {
  border-left: 1px solid var(--auralis-border-subtle);
}

.archive-summary-item > .archive-summary-label,
.archive-summary-item > .archive-summary-value {
  transition:
    opacity 120ms ease,
    transform 160ms ease;
}

.archive-summary-item:hover > .archive-summary-label,
.archive-summary-item:hover > .archive-summary-value,
.archive-summary-item:focus-within > .archive-summary-label,
.archive-summary-item:focus-within > .archive-summary-value {
  opacity: 0;
  transform: translateY(-4px);
}

.archive-summary-label {
  display: block;
  color: var(--auralis-text-muted);
  font-size: 12px;
}

.archive-summary-value {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 7px;
  margin-top: 9px;
  color: var(--auralis-text);
}

.archive-summary-value strong {
  overflow: hidden;
  font-size: 24px;
  font-weight: 680;
  letter-spacing: -0.02em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-summary-value span {
  flex-shrink: 0;
  color: var(--auralis-text-faint);
  font-size: 12px;
}

.archive-summary-expanded {
  position: absolute;
  z-index: 30;
  top: 50%;
  left: 50%;
  display: grid;
  width: 160%;
  height: 160%;
  min-height: 154px;
  overflow: hidden;
  padding: 20px 22px;
  border: 1px solid var(--auralis-playbar-border);
  border-radius: 18px;
  background: var(--auralis-playbar-bg);
  box-shadow: 0 20px 50px rgba(20, 24, 28, 0.2);
  -webkit-backdrop-filter: blur(12px) saturate(1.2) contrast(1.04);
  backdrop-filter: blur(12px) saturate(1.2) contrast(1.04);
  grid-template-columns: minmax(0, 0.88fr) minmax(0, 1.2fr);
  column-gap: 20px;
  isolation: isolate;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, -50%) scale(0.72);
  transition:
    opacity 150ms ease,
    transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.archive-summary-expanded::before {
  position: absolute;
  z-index: 0;
  border-radius: inherit;
  background:
    linear-gradient(
      180deg,
      var(--auralis-playbar-highlight) 0%,
      var(--auralis-playbar-highlight-soft) 18%,
      transparent 48%,
      var(--auralis-playbar-lowlight) 100%
    ),
    linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.1) 50%, transparent 100%);
  content: '';
  inset: 1px;
  opacity: 0.72;
  pointer-events: none;
}

.archive-summary-item:first-child .archive-summary-expanded {
  left: 0;
  transform: translate(0, -50%) scale(0.72);
  transform-origin: left center;
}

.archive-summary-item:last-child .archive-summary-expanded {
  right: 0;
  left: auto;
  transform: translate(0, -50%) scale(0.72);
  transform-origin: right center;
}

.archive-summary-item:hover .archive-summary-expanded,
.archive-summary-item:focus-within .archive-summary-expanded {
  opacity: 1;
  pointer-events: auto;
  transform: translate(-50%, -50%) scale(1);
}

.archive-summary-item:first-child:hover .archive-summary-expanded,
.archive-summary-item:first-child:focus-within .archive-summary-expanded,
.archive-summary-item:last-child:hover .archive-summary-expanded,
.archive-summary-item:last-child:focus-within .archive-summary-expanded {
  transform: translate(0, -50%) scale(1);
}

.archive-summary-expanded-main {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  padding-right: 2px;
}

.archive-summary-expanded-main .archive-summary-label {
  font-size: 13px;
}

.archive-summary-expanded-main .archive-summary-value {
  margin-top: 10px;
}

.archive-summary-expanded-main .archive-summary-value strong {
  font-size: 30px;
  letter-spacing: -0.04em;
}

.archive-summary-expanded-main .archive-summary-value span {
  font-size: 13px;
}

.archive-summary-details {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  gap: 9px;
  padding-left: 20px;
  border-left: 1px solid color-mix(in srgb, var(--auralis-text) 10%, transparent);
  color: color-mix(in srgb, var(--auralis-text) 76%, transparent);
  font-size: 13px;
  font-weight: 560;
  line-height: 1.35;
}

.archive-summary-details span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-summary-details small {
  align-self: flex-start;
  margin-top: 2px;
  padding-top: 2px;
  color: var(--auralis-sidebar-active-indicator);
  font-size: 11px;
  font-weight: 650;
}

.archive-summary-item--peak-day .archive-summary-expanded {
  height: 170%;
  min-height: 174px;
  padding: 20px 22px;
  grid-template-columns: minmax(0, 0.72fr) minmax(0, 1.28fr);
}

.archive-summary-item--peak-day .archive-summary-expanded-main {
  justify-content: flex-start;
  padding-top: 10px;
}

.archive-summary-item--peak-day .archive-summary-details {
  justify-content: center;
  gap: 11px;
  padding-left: 18px;
}

.archive-summary-item--peak-day .archive-summary-details span {
  min-height: 0;
  padding: 0;
}

.archive-summary-item--peak-day .archive-summary-details small {
  display: block;
  width: auto;
  min-height: 0;
  margin-top: 0;
  padding: 0;
  font-size: 11px;
}

.archive-ranking {
  margin-top: 42px;
  padding-bottom: 12px;
}

.archive-ranking-heading,
.archive-ranking-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.archive-ranking-heading h2 {
  color: var(--auralis-text);
  font-size: 17px;
  font-weight: 650;
}

.archive-ranking-heading p {
  margin-top: 6px;
  color: var(--auralis-text-muted);
  font-size: 12px;
}

.archive-ranking-ranges,
.archive-ranking-targets {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.archive-ranking-ranges button,
.archive-ranking-targets button,
.archive-ranking-period > button,
.archive-ranking-period-menu button {
  border-radius: 9px;
  color: var(--auralis-text-muted);
  font-size: 12px;
  font-weight: 600;
  transition:
    color 150ms ease,
    background-color 150ms ease;
}

.archive-ranking-ranges button,
.archive-ranking-targets button {
  height: 30px;
  padding: 0 10px;
}

.archive-ranking-ranges button:hover,
.archive-ranking-targets button:hover,
.archive-ranking-period > button:hover,
.archive-ranking-period-menu button:hover {
  background: var(--auralis-control-hover-bg);
  color: var(--auralis-text);
}

.archive-ranking-ranges button.is-active,
.archive-ranking-targets button.is-active,
.archive-ranking-period-menu button.is-active {
  background: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 14%, transparent);
  color: var(--auralis-sidebar-active-indicator);
}

.archive-ranking-toolbar {
  margin-top: 16px;
}

.archive-ranking-period {
  position: relative;
}

.archive-ranking-period > button {
  display: inline-flex;
  height: 30px;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
}

.archive-ranking-picker {
  position: absolute;
  z-index: 40;
  top: calc(100% + 8px);
  right: 0;
  min-width: 220px;
  padding: 10px;
  border: 1px solid var(--auralis-playbar-border);
  border-radius: 14px;
  background: var(--auralis-playbar-bg);
  box-shadow: 0 18px 42px rgba(20, 24, 28, 0.18);
  -webkit-backdrop-filter: blur(12px) saturate(1.2) contrast(1.04);
  backdrop-filter: blur(12px) saturate(1.2) contrast(1.04);
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 8px;
  color: var(--auralis-text);
  font-size: 13px;
  font-weight: 650;
}

.picker-header button {
  display: inline-flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  color: var(--auralis-text-muted);
  transition:
    color 150ms ease,
    background-color 150ms ease;
}

.picker-header button:hover:not(:disabled) {
  background: var(--auralis-control-hover-bg);
  color: var(--auralis-text);
}

.picker-header button:disabled {
  opacity: 0.3;
  cursor: default;
}

/* Mini calendar */
.picker-calendar {
  padding: 2px 0;
}

.calendar-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 4px;
  color: var(--auralis-text-faint);
  font-size: 10px;
  text-align: center;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.calendar-grid button {
  display: flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  color: var(--auralis-text);
  font-size: 12px;
  font-weight: 550;
  transition:
    background-color 120ms ease,
    color 120ms ease;
}

.calendar-grid button:not(.is-empty):not(:disabled):hover {
  background: var(--auralis-control-hover-bg);
}

.calendar-grid button.is-empty {
  cursor: default;
}

.calendar-grid button:disabled {
  opacity: 0.35;
  cursor: default;
}

.calendar-grid button.is-today {
  color: var(--auralis-sidebar-active-indicator);
  font-weight: 680;
}

.calendar-grid button.is-selected {
  background: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 18%, transparent);
  color: var(--auralis-sidebar-active-indicator);
  font-weight: 680;
}

/* Week list */
.picker-week-list {
  display: grid;
  max-height: 240px;
  gap: 2px;
  overflow-y: auto;
  padding: 2px 0;
  scrollbar-color: color-mix(in srgb, var(--auralis-text) 20%, transparent) transparent;
  scrollbar-width: thin;
}

.picker-week-list::-webkit-scrollbar {
  width: 5px;
}

.picker-week-list::-webkit-scrollbar-track {
  background: transparent;
}

.picker-week-list::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: color-mix(in srgb, var(--auralis-text) 20%, transparent);
}

.picker-week-list::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--auralis-text) 30%, transparent);
}

.picker-week-list button {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 8px;
  border-radius: 8px;
  color: var(--auralis-text);
  font-size: 12px;
  font-weight: 550;
  text-align: left;
  transition:
    background-color 120ms ease,
    color 120ms ease;
}

.picker-week-list button:hover:not(:disabled) {
  background: var(--auralis-control-hover-bg);
}

.picker-week-list button:disabled {
  opacity: 0.35;
  cursor: default;
}

.picker-week-list button.is-active,
.picker-week-list button.is-current {
  color: var(--auralis-sidebar-active-indicator);
}

.picker-week-list .week-date-range {
  margin-left: auto;
  color: var(--auralis-text-faint);
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
}

/* Month / Quarter list */
.picker-list {
  display: grid;
  min-width: 160px;
  gap: 2px;
  padding: 2px 0;
}

.picker-list button {
  height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  color: var(--auralis-text-muted);
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  transition:
    color 150ms ease,
    background-color 150ms ease;
}

.picker-list button:hover {
  background: var(--auralis-control-hover-bg);
  color: var(--auralis-text);
}

.picker-list button.is-active {
  background: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 14%, transparent);
  color: var(--auralis-sidebar-active-indicator);
}

/* "回到今天" / "回到本周" button */
.picker-today-btn {
  display: block;
  width: 100%;
  margin-top: 6px;
  padding: 6px 0;
  border-radius: 8px;
  color: var(--auralis-sidebar-active-indicator);
  font-size: 11px;
  font-weight: 650;
  text-align: center;
  transition: background-color 150ms ease;
}

.picker-today-btn:hover {
  background: var(--auralis-control-hover-bg);
}

.archive-ranking-state {
  display: flex;
  min-height: 180px;
  align-items: center;
  justify-content: center;
  border-top: 1px solid var(--auralis-border-subtle);
  border-bottom: 1px solid var(--auralis-border-subtle);
  margin-top: 14px;
  color: var(--auralis-text-muted);
  font-size: 13px;
}

.archive-ranking-list {
  display: grid;
  gap: 2px;
  margin-top: 14px;
  max-height: 588px;
  overflow-y: auto;
  padding: 8px 0;
  border-top: 1px solid var(--auralis-border-subtle);
  border-bottom: 1px solid var(--auralis-border-subtle);
  scrollbar-color: color-mix(in srgb, var(--auralis-text) 20%, transparent) transparent;
  scrollbar-width: thin;
  list-style: none;
}

.archive-ranking-list::-webkit-scrollbar {
  width: 5px;
}

.archive-ranking-list::-webkit-scrollbar-track {
  background: transparent;
}

.archive-ranking-list::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: color-mix(in srgb, var(--auralis-text) 20%, transparent);
}

.archive-ranking-list::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--auralis-text) 30%, transparent);
}

.archive-ranking-list li {
  display: grid;
  min-width: 0;
  align-items: center;
  padding: 8px 10px;
  border-radius: 11px;
  grid-template-columns: 30px 42px minmax(0, 1fr) auto;
  gap: 12px;
}

.archive-ranking-list li:hover {
  background: var(--auralis-control-hover-bg);
}

.archive-ranking-rank {
  color: var(--auralis-text-faint);
  font-size: 11px;
  text-align: center;
}

.archive-ranking-artwork {
  display: flex;
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 9px;
  background: var(--auralis-control-hover-bg);
  color: var(--auralis-text-faint);
}

.archive-ranking-artwork img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.archive-ranking-copy,
.archive-ranking-meta {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.archive-ranking-copy {
  gap: 3px;
}

.archive-ranking-copy strong,
.archive-ranking-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-ranking-copy strong {
  color: var(--auralis-text);
  font-size: 13px;
  font-weight: 650;
}

.archive-ranking-copy span,
.archive-ranking-meta span {
  color: var(--auralis-text-muted);
  font-size: 11px;
}

.archive-ranking-meta {
  align-items: flex-end;
  gap: 3px;
  white-space: nowrap;
}

.archive-ranking-meta strong {
  color: var(--auralis-text);
  font-size: 12px;
  font-weight: 650;
}

.archive-tooltip {
  position: fixed;
  z-index: 90;
  padding: 6px 9px;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 8px;
  background: var(--auralis-sidebar-bg);
  box-shadow: 0 8px 24px rgba(20, 24, 28, 0.16);
  color: var(--auralis-text);
  font-size: 11px;
  pointer-events: none;
  transform: translate(-50%, calc(-100% - 10px));
  white-space: nowrap;
}

.archive-detail-backdrop {
  position: fixed;
  z-index: 100;
  inset: 0;
  background: rgba(12, 16, 20, 0);
  pointer-events: none;
  transition: background-color 240ms ease;
}

.archive-detail-backdrop.is-visible {
  background: rgba(12, 16, 20, 0.38);
  pointer-events: auto;
}

.archive-reset-backdrop {
  position: fixed;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  inset: 0;
  padding: 20px;
  background: rgba(12, 16, 20, 0.42);
  animation: archive-reset-backdrop-in 180ms ease both;
}

.archive-reset-dialog {
  width: min(430px, calc(100vw - 40px));
  padding: 28px;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 18px;
  background: var(--auralis-sidebar-bg);
  box-shadow: 0 28px 80px rgba(10, 14, 18, 0.3);
  color: var(--auralis-text);
  animation: archive-reset-dialog-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.archive-reset-dialog h2 {
  font-size: 20px;
  font-weight: 680;
  line-height: 1.35;
}

.archive-reset-dialog > p {
  margin-top: 12px;
  color: var(--auralis-text-muted);
  font-size: 13px;
  line-height: 1.7;
}

.archive-reset-dialog .archive-reset-error {
  color: #d94a4a;
}

.archive-reset-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 9px;
  margin-top: 26px;
  padding-bottom: 14px;
}

.archive-reset-buttons button {
  width: 78px;
  min-width: 78px;
  height: 34px;
  padding: 0 14px;
  border-radius: 9px;
  background: var(--auralis-control-hover-bg);
  color: var(--auralis-text);
  font-size: 12px;
  font-weight: 600;
  transition:
    opacity 150ms ease,
    background-color 150ms ease;
}

.archive-reset-buttons button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--auralis-text) 11%, transparent);
}

.archive-reset-buttons button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.archive-reset-buttons .archive-reset-confirm {
  position: relative;
  overflow: hidden;
  background: #d94a4a;
  color: #fff;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.archive-reset-buttons .archive-reset-confirm::before {
  position: absolute;
  background: rgba(255, 255, 255, 0.28);
  content: '';
  inset: 0;
  transform: scaleX(0);
  transform-origin: left;
}

.archive-reset-buttons .archive-reset-confirm.is-holding::before {
  animation: archive-reset-hold-fill 3s linear forwards;
}

.archive-reset-buttons .archive-reset-confirm span {
  position: relative;
  z-index: 1;
}

.archive-reset-confirm-wrap {
  position: relative;
  width: 78px;
}

.archive-reset-hint {
  position: absolute;
  top: calc(100% + 5px);
  left: 50%;
  color: var(--auralis-text-faint);
  font-size: 10px;
  line-height: 1;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, -2px);
  transition:
    opacity 140ms ease,
    transform 140ms ease;
  white-space: nowrap;
}

.archive-reset-confirm-wrap:hover .archive-reset-hint,
.archive-reset-confirm-wrap:focus-within .archive-reset-hint {
  opacity: 1;
  transform: translate(-50%, 0);
}

.archive-reset-buttons .archive-reset-confirm:hover:not(:disabled) {
  background: #bf3030;
}

@keyframes archive-reset-backdrop-in {
  from {
    opacity: 0;
  }
}

@keyframes archive-reset-dialog-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
}

@keyframes archive-reset-hold-fill {
  to {
    transform: scaleX(1);
  }
}

.archive-detail-dialog {
  position: fixed;
  top: var(--dialog-origin-y);
  left: var(--dialog-origin-x);
  width: 176px;
  height: 32px;
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 8px;
  background: var(--auralis-sidebar-bg);
  box-shadow: 0 8px 24px rgba(20, 24, 28, 0.16);
  color: var(--auralis-text);
  opacity: 0;
  transform: translate(-50%, calc(-100% - 10px));
  transform-origin: top left;
  transition:
    top 280ms cubic-bezier(0.2, 0.8, 0.2, 1),
    left 280ms cubic-bezier(0.2, 0.8, 0.2, 1),
    width 280ms cubic-bezier(0.2, 0.8, 0.2, 1),
    height 280ms cubic-bezier(0.2, 0.8, 0.2, 1),
    padding 280ms cubic-bezier(0.2, 0.8, 0.2, 1),
    border-radius 280ms ease,
    opacity 80ms ease,
    transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.archive-detail-dialog.is-expanded {
  top: 50%;
  left: 50%;
  display: flex;
  flex-direction: column;
  width: min(520px, calc(100vw - 40px));
  height: min(650px, calc(100vh - 80px));
  padding: 24px;
  border-radius: 18px;
  box-shadow: 0 28px 80px rgba(10, 14, 18, 0.28);
  opacity: 1;
  transform: translate(-50%, -50%);
}

.archive-detail-header,
.archive-top-tracks,
.archive-detail-state {
  opacity: 0;
  transform: translateY(8px);
  transition:
    opacity 160ms ease 120ms,
    transform 200ms ease 120ms;
}

.archive-detail-dialog.is-expanded .archive-detail-header,
.archive-detail-dialog.is-expanded .archive-top-tracks,
.archive-detail-dialog.is-expanded .archive-detail-state {
  opacity: 1;
  transform: translateY(0);
}

.archive-detail-header {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.archive-detail-header > div > span {
  color: var(--auralis-text-muted);
  font-size: 12px;
}

.archive-detail-header h2 {
  margin-top: 4px;
  font-size: 21px;
  font-weight: 680;
}

.archive-detail-header p {
  margin-top: 5px;
  color: var(--auralis-text-faint);
  font-size: 12px;
}

.archive-detail-header button {
  display: inline-flex;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  color: var(--auralis-text-muted);
}

.archive-detail-header button:hover {
  background: var(--auralis-control-hover-bg);
  color: var(--auralis-text);
}

.archive-detail-state {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--auralis-text-muted);
  font-size: 13px;
}

.archive-top-tracks {
  display: grid;
  flex: 1;
  gap: 2px;
  margin-top: 18px;
  overflow-y: auto;
  padding: 0 4px 16px 0;
  scrollbar-color: color-mix(in srgb, var(--auralis-text) 24%, transparent) transparent;
  scrollbar-width: thin;
  list-style: none;
}

.archive-top-tracks::-webkit-scrollbar {
  width: 5px;
}

.archive-top-tracks::-webkit-scrollbar-track {
  background: transparent;
}

.archive-top-tracks::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: color-mix(in srgb, var(--auralis-text) 24%, transparent);
}

.archive-top-tracks::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--auralis-text) 34%, transparent);
}

.archive-top-tracks li {
  display: grid;
  min-width: 0;
  align-items: center;
  padding: 7px 8px;
  border-radius: 10px;
  grid-template-columns: 22px 38px minmax(0, 1fr) auto;
  gap: 10px;
}

.archive-top-tracks li:hover {
  background: var(--auralis-control-hover-bg);
}

.archive-track-rank,
.archive-track-count {
  color: var(--auralis-text-faint);
  font-size: 11px;
}

.archive-track-rank {
  text-align: center;
}

.archive-track-artwork {
  display: flex;
  width: 38px;
  height: 38px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 8px;
  background: var(--auralis-control-hover-bg);
  color: var(--auralis-text-faint);
}

.archive-track-artwork img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.archive-track-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.archive-track-copy strong,
.archive-track-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-track-copy strong {
  font-size: 13px;
  font-weight: 600;
}

.archive-track-copy span {
  color: var(--auralis-text-muted);
  font-size: 11px;
}

.archive-track-count {
  padding-left: 8px;
  white-space: nowrap;
}

@media (max-width: 900px) {
  .archive-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .archive-summary-item:nth-child(3) {
    border-top: 1px solid var(--auralis-border-subtle);
    border-left: 0;
  }

  .archive-summary-item:nth-child(4) {
    border-top: 1px solid var(--auralis-border-subtle);
  }

  .archive-summary-item:nth-child(odd) .archive-summary-expanded {
    right: auto;
    left: 0;
    transform: translate(0, -50%) scale(0.72);
    transform-origin: left center;
  }

  .archive-summary-item:nth-child(even) .archive-summary-expanded {
    right: 0;
    left: auto;
    transform: translate(0, -50%) scale(0.72);
    transform-origin: right center;
  }

  .archive-summary-item:nth-child(n):hover .archive-summary-expanded,
  .archive-summary-item:nth-child(n):focus-within .archive-summary-expanded {
    transform: translate(0, -50%) scale(1);
  }
}
</style>
