<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
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
import { formatArtist } from '@renderer/features/library/utils/formatArtist'
import { useArtworkPalette } from '@renderer/features/playback/composables/useArtworkPalette'

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
let detailRequestId = 0
let detailDialogId = 0
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
const showAnnualRecap = ref(false)
const isAnnualRecapLoading = ref(false)
const annualRecapError = ref<string | null>(null)
const annualRecapTrackRanking = ref<ListeningRanking | null>(null)
const annualRecapAlbumRanking = ref<ListeningRanking | null>(null)
const annualRecapPage = ref(0)

const LONG_PRESS_MS = 1000
const RESET_HOLD_MS = 3000
const ARCHIVE_SCROLLBAR_HIDDEN_CLASS = 'archive-page-scrollbar-hidden'
const rankingRanges: Array<{ value: ListeningRankingRange; label: string }> = [
  { value: 'day', label: '日' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
]
const rankingTargets: Array<{ value: ListeningRankingTarget; label: string; icon: string }> = [
  { value: 'track', label: '单曲', icon: 'i-lucide-music-2' },
  { value: 'album', label: '专辑', icon: 'i-lucide-disc-3' },
]
let longPressTimer: number | null = null
let resetHoldTimer: number | null = null
let rankingRequestId = 0
let annualRecapRequestId = 0
let unsubscribeLibraryChanged: (() => void) | null = null

const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const annualRecapWeekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const ANNUAL_RECAP_PAGE_COUNT = 5

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

const maxRankingMonth = computed(() =>
  rankingYear.value === currentYear ? new Date().getMonth() + 1 : 12,
)
const rankingMonthOptions = computed(() =>
  Array.from({ length: maxRankingMonth.value }, (_, index) => index + 1),
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
  return `${rankingYear.value}年`
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
          ? `年度最常听 · ${topTrack.title || '未知歌曲'} · ${topTrack.playCount}\u00a0次`
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

const annualRecapTrackTop10 = computed(
  () => annualRecapTrackRanking.value?.items.slice(0, 10) ?? [],
)

const annualRecapAlbumTop10 = computed(
  () => annualRecapAlbumRanking.value?.items.slice(0, 10) ?? [],
)

const annualRecapMetrics = computed(() => {
  const elapsedDays = calendarDays.value.filter((day) => !day.isFuture)
  const listeningDays = elapsedDays.filter((day) => day.playCount > 0).length
  const totalPlays = elapsedDays.reduce((total, day) => total + day.playCount, 0)
  const totalDurationSeconds = elapsedDays.reduce((total, day) => total + day.durationSeconds, 0)
  const totalMinutes = Math.round(totalDurationSeconds / 60)
  const monthPlayCounts = Array.from({ length: 12 }, () => 0)
  const weekdayPlayCounts = Array.from({ length: 7 }, () => 0)
  let longestStreak = 0
  let currentStreak = 0

  for (const day of elapsedDays) {
    const monthIndex = Number(day.date.slice(5, 7)) - 1
    const weekdayIndex = new Date(`${day.date}T00:00:00`).getDay()
    monthPlayCounts[monthIndex] += day.playCount
    weekdayPlayCounts[weekdayIndex] += day.playCount

    if (day.playCount > 0) {
      currentStreak += 1
      longestStreak = Math.max(longestStreak, currentStreak)
    } else {
      currentStreak = 0
    }
  }

  const maxMonthPlayCount = Math.max(...monthPlayCounts, 0)
  const mostActiveMonthIndex = monthPlayCounts.reduce(
    (bestIndex, count, index, counts) => (count > counts[bestIndex] ? index : bestIndex),
    0,
  )
  const mostActiveWeekdayIndex = weekdayPlayCounts.reduce(
    (bestIndex, count, index, counts) => (count > counts[bestIndex] ? index : bestIndex),
    0,
  )
  const activePeakDay = peakDay.value

  return {
    totalPlays,
    totalDurationSeconds,
    totalMinutes,
    listeningDays,
    longestStreak,
    peakDayLabel: activePeakDay?.label ?? '暂无记录',
    peakDayPlayCount: activePeakDay?.playCount ?? 0,
    mostActiveMonthLabel:
      totalPlays > 0
        ? `${mostActiveMonthIndex + 1}月 · ${monthPlayCounts[mostActiveMonthIndex]} 次`
        : '暂无记录',
    mostActiveWeekdayLabel:
      totalPlays > 0
        ? `${annualRecapWeekdays[mostActiveWeekdayIndex]} · ${weekdayPlayCounts[mostActiveWeekdayIndex]} 次`
        : '暂无记录',
    monthBars: monthPlayCounts.map((playCount, index) => ({
      month: index + 1,
      playCount,
      height:
        maxMonthPlayCount > 0 ? Math.max(8, Math.round((playCount / maxMonthPlayCount) * 100)) : 0,
    })),
  }
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
    } else if (rankingRange.value === 'year') {
      params.year = rankingYear.value
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

function clearAnnualRecapRankings(): void {
  annualRecapTrackRanking.value = null
  annualRecapAlbumRanking.value = null
  annualRecapError.value = null
}

async function loadAnnualRecapRankings(): Promise<void> {
  const requestId = ++annualRecapRequestId
  isAnnualRecapLoading.value = true
  annualRecapError.value = null

  try {
    const year = selectedYear.value
    const [trackRanking, albumRanking] = await Promise.all([
      auralis.archive.getListeningRanking({ range: 'year', target: 'track', year }),
      auralis.archive.getListeningRanking({ range: 'year', target: 'album', year }),
    ])
    if (requestId !== annualRecapRequestId) return
    annualRecapTrackRanking.value = trackRanking
    annualRecapAlbumRanking.value = albumRanking
  } catch {
    if (requestId !== annualRecapRequestId) return
    annualRecapTrackRanking.value = null
    annualRecapAlbumRanking.value = null
    annualRecapError.value = '年度排行读取失败'
  } finally {
    if (requestId === annualRecapRequestId) {
      isAnnualRecapLoading.value = false
    }
  }
}

function openAnnualRecap(): void {
  annualRecapPage.value = 0
  showAnnualRecap.value = true
  void loadAnnualRecapRankings()
}

function closeAnnualRecap(): void {
  showAnnualRecap.value = false
}

function setAnnualRecapPage(page: number): void {
  annualRecapPage.value = Math.min(Math.max(page, 0), ANNUAL_RECAP_PAGE_COUNT - 1)
}

function goToPreviousAnnualRecapPage(): void {
  setAnnualRecapPage(annualRecapPage.value - 1)
}

function goToNextAnnualRecapPage(): void {
  setAnnualRecapPage(annualRecapPage.value + 1)
}

function setRankingRange(range: ListeningRankingRange): void {
  if (rankingRange.value === range) return
  rankingRange.value = range
  showRankingPicker.value = false
  if (range === 'month' || range === 'year') {
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

const selectedAlbumIndex = ref<number>(0)

const selectedAlbumItem = computed(() => {
  if (rankingTarget.value !== 'album' || !listeningRanking.value?.items.length) return null
  return listeningRanking.value.items[selectedAlbumIndex.value] || listeningRanking.value.items[0]
})

/** Hero glow follows selected ranking album (not the now-playing track). */
const selectedAlbumArtworkKey = computed(() => selectedAlbumItem.value?.artworkCacheKey ?? null)
const { palette: selectedAlbumPalette } = useArtworkPalette(selectedAlbumArtworkKey)

const albumHeroStageStyle = computed((): CSSProperties => {
  const accent = selectedAlbumPalette.value.accents[0]?.rgb
  // FALLBACK_PALETTE accent is already a cool slate-blue when extraction fails / no art.
  const glow = accent
    ? `rgb(${accent.r} ${accent.g} ${accent.b})`
    : 'rgb(64 92 128)'
  return {
    '--album-hero-glow': glow,
  } as CSSProperties
})

const heroCanvasRef = ref<HTMLCanvasElement | null>(null)

function updateHeroStaticFluid(): void {
  const item = selectedAlbumItem.value
  const canvas = heroCanvasRef.value
  if (!item || !canvas) return

  const url = getArtworkUrl(item.artworkCacheKey)
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const width = (canvas.width = 240)
  const height = (canvas.height = 340)

  if (!url) {
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#141518'
    ctx.fillRect(0, 0, width, height)
    return
  }

  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    const sampleCanvas = document.createElement('canvas')
    sampleCanvas.width = 16
    sampleCanvas.height = 16
    const sCtx = sampleCanvas.getContext('2d')
    if (!sCtx) return
    sCtx.drawImage(img, 0, 0, 16, 16)
    const imgData = sCtx.getImageData(0, 0, 16, 16).data

    const c1 = `rgb(${imgData[0]}, ${imgData[1]}, ${imgData[2]})`
    const c2 = `rgb(${imgData[15 * 4]}, ${imgData[15 * 4 + 1]}, ${imgData[15 * 4 + 2]})`
    const c3 = `rgb(${imgData[16 * 15 * 4]}, ${imgData[16 * 15 * 4 + 1]}, ${imgData[16 * 15 * 4 + 2]})`
    const c4 = `rgb(${imgData[(16 * 16 - 1) * 4]}, ${imgData[(16 * 16 - 1) * 4 + 1]}, ${imgData[(16 * 16 - 1) * 4 + 2]})`

    ctx.fillStyle = '#0e0f12'
    ctx.fillRect(0, 0, width, height)

    const drawBlob = (x: number, y: number, r: number, color: string) => {
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
      grad.addColorStop(0, color)
      grad.addColorStop(1, 'transparent')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    ctx.globalAlpha = 0.7
    drawBlob(40, 50, 160, c1)
    drawBlob(200, 60, 150, c2)
    drawBlob(50, 280, 170, c3)
    drawBlob(190, 290, 160, c4)
    ctx.restore()
  }
  img.src = url
}

watch(selectedAlbumItem, () => {
  void nextTick(() => {
    updateHeroStaticFluid()
  })
})

watch(rankingTarget, () => {
  selectedAlbumIndex.value = 0
})

watch(listeningRanking, () => {
  selectedAlbumIndex.value = 0
})

const pickerPos = ref<{ top: number; left: number }>({ top: 0, left: 0 })

function toggleRankingPicker(event?: MouseEvent | KeyboardEvent): void {
  if (!showRankingPicker.value && event?.currentTarget) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    pickerPos.value = {
      top: rect.top - 8,
      left: rect.right,
    }
  }
  showRankingPicker.value = !showRankingPicker.value
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

function formatRankingArtist(artist: string | null): string {
  return formatArtist(artist) || '未知艺术家'
}

function formatAnnualTopTrack(detail: string): string {
  return detail.replace(/^年度最常听 · /, '')
}

function formatDailyTopTracks(detail: string): string {
  return detail.replace(/^Top 3 · /, '')
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

  // Increment request ID so any in-flight request for a previous day is discarded
  const requestId = ++detailRequestId
  // Bump dialog instance counter so any close timer from a previous instance
  // (even for the same date) won't clear this newly opened dialog
  ++detailDialogId
  const dateKey = day.date

  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  tooltip.value = null
  dailyDetail.value = null
  detailError.value = null
  isDetailLoading.value = true
  detailDialog.value = {
    date: dateKey,
    label: day.label,
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    expanded: false,
  }

  await nextTick()
  if (detailDialog.value?.date === dateKey) {
    detailDialog.value.expanded = true
  }

  try {
    const detail = await auralis.archive.getDailyListeningDetail(dateKey)
    // Discard stale responses and only apply the latest request.
    if (requestId !== detailRequestId) return
    if (detailDialog.value?.date !== dateKey) return
    dailyDetail.value = detail
  } catch (error) {
    if (requestId !== detailRequestId) return
    if (detailDialog.value?.date !== dateKey) return
    detailError.value = error instanceof Error ? error.message : '无法读取当日播放记录'
  } finally {
    if (requestId === detailRequestId) {
      isDetailLoading.value = false
    }
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
  const closeToken = detailDialogId
  detailDialog.value.expanded = false
  window.setTimeout(() => {
    // Guard: only null if the dialog instance has not been replaced.
    // Using an instance counter avoids the same-date race: closing day X
    // and reopening day X within the 240ms animation window would pass a
    // date-based guard but must not clear the new instance.
    if (detailDialogId === closeToken) {
      detailDialog.value = null
      dailyDetail.value = null
      detailError.value = null
    }
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

function handleDocumentKeyDown(event: KeyboardEvent): void {
  if (!showAnnualRecap.value) return
  if (event.key === 'Escape') {
    closeAnnualRecap()
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    goToPreviousAnnualRecapPage()
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    goToNextAnnualRecapPage()
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
    clearAnnualRecapRankings()
    await loadHeatmap()
    await loadListeningRanking()
    if (showAnnualRecap.value) {
      await loadAnnualRecapRankings()
    }
  } catch (error) {
    resetError.value = error instanceof Error ? error.message : '无法重置播放数据'
  } finally {
    isResetting.value = false
  }
}

onMounted(() => {
  document.body.classList.add(ARCHIVE_SCROLLBAR_HIDDEN_CLASS)
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeyDown)
  void loadHeatmap()
  void loadListeningRanking()
  unsubscribeLibraryChanged = auralis.library.onChanged((event) => {
    if (event.reason !== 'play-stats-updated' && event.reason !== 'play-stats-reset') return
    void loadHeatmap()
    void loadListeningRanking()
    if (showAnnualRecap.value) {
      void loadAnnualRecapRankings()
    }
  })
})

onBeforeUnmount(() => {
  cancelLongPress()
  cancelResetHold()
  unsubscribeLibraryChanged?.()
  document.body.classList.remove(ARCHIVE_SCROLLBAR_HIDDEN_CLASS)
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeyDown)
})
</script>

<template>
  <section class="archive-page content-frame">
    <div class="archive-heatmap-card">
      <div class="archive-card-heading">
        <div>
          <span class="archive-section-kicker">Calendar</span>
          <h2>音乐日历</h2>
          <p>颜色越深，代表那一天留下的播放时间越多。</p>
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
      <div class="archive-section-heading">
        <div class="archive-title-row" data-reset-control>
          <div>
            <span class="archive-section-kicker">Annual Notes</span>
            <h2
              role="button"
              tabindex="0"
              aria-label="年度摘要，长按一秒显示播放数据重置操作"
              @pointerdown="startLongPress"
              @pointerup="cancelLongPress"
              @pointerleave="cancelLongPress"
              @pointercancel="cancelLongPress"
              @keydown="handleTitleKeyDown"
              @keyup="handleTitleKeyUp"
              @blur="cancelLongPress"
              @contextmenu.prevent
            >
              年度摘要
            </h2>
            <p>把这一年的活跃天数、播放次数、时长和峰值浓缩成四条线索。</p>
          </div>
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
        <button type="button" class="archive-annual-recap-entry" @click="openAnnualRecap">
          <span class="i-lucide-sparkles h-4 w-4"></span>
          <span>年度总结</span>
        </button>
      </div>
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
              <template v-for="(detail, detailIndex) in item.details" :key="detail">
                <div
                  v-if="
                    item.key === 'plays' && detailIndex === 2 && detail.startsWith('年度最常听 · ')
                  "
                  class="archive-summary-top-track"
                >
                  <span class="archive-summary-top-track-label">年度最常听</span>
                  <span class="archive-summary-top-track-value">
                    {{ formatAnnualTopTrack(detail) }}
                  </span>
                </div>
                <div
                  v-else-if="
                    item.key === 'peakDay' && detailIndex === 2 && detail.startsWith('Top 3 · ')
                  "
                  class="archive-summary-top-tracks"
                >
                  <span class="archive-summary-top-tracks-label">Top 3</span>
                  <span class="archive-summary-top-tracks-value">
                    {{ formatDailyTopTracks(detail) }}
                  </span>
                </div>
                <span v-else>{{ detail }}</span>
              </template>
              <small v-if="item.clickable">点击查看完整 Top 10</small>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="!isLoading && !errorMessage" class="archive-ranking">
      <div class="archive-ranking-heading">
        <div>
          <span class="archive-section-kicker">Replay Index</span>
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
            :aria-label="`切换到${target.label}榜`"
            :title="target.label"
            @click="setRankingTarget(target.value)"
          >
            <span :class="`${target.icon} h-4 w-4`"></span>
          </button>
        </div>

        <div class="archive-ranking-period" data-ranking-period-control>
          <button type="button" @click="toggleRankingPicker($event)">
            <span>{{ rankingPeriodLabel }}</span>
            <span class="i-lucide-chevron-down h-3.5 w-3.5"></span>
          </button>
        </div>
      </div>

      <div v-if="isRankingLoading" class="archive-ranking-state">正在整理排行…</div>
      <div v-else-if="rankingError" class="archive-ranking-state archive-state--error">
        {{ rankingError }}
      </div>
      <div v-else-if="!listeningRanking?.items.length" class="archive-ranking-state">
        暂无排行数据
      </div>
      <!-- Track Ranking (Single column list) -->
      <ol v-else-if="rankingTarget === 'track'" class="archive-ranking-list">
        <li v-for="(item, index) in listeningRanking.items" :key="item.key">
          <span
            class="archive-ranking-rank"
            :class="{
              'rank-gold': index === 0,
              'rank-silver': index === 1,
              'rank-bronze': index === 2,
            }"
            >{{ index + 1 }}</span
          >
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
              {{ item.title || '未知歌曲' }}
            </strong>
            <span>{{ formatRankingArtist(item.artist) }}</span>
          </div>
          <div class="archive-ranking-meta">
            <strong>{{ item.playCount }} 次</strong>
            <span>{{ formatMinutes(item.durationSeconds) }}</span>
          </div>
        </li>
      </ol>

      <!-- Album Ranking (Editorial Magazine Split Layout) -->
      <div v-else class="archive-album-magazine-layout">
        <!-- Left: Hero Stage -->
        <div v-if="selectedAlbumItem" class="album-hero-stage" :style="albumHeroStageStyle">
          <canvas ref="heroCanvasRef" class="album-hero-static-canvas"></canvas>
          <div class="album-hero-cover-wrapper">
            <img
              v-if="getArtworkUrl(selectedAlbumItem.artworkCacheKey)"
              :src="getArtworkUrl(selectedAlbumItem.artworkCacheKey) ?? undefined"
              alt=""
              class="album-hero-cover"
            />
            <div v-else class="album-hero-cover-placeholder">
              <span class="i-lucide-disc-3 h-12 w-12 opacity-40"></span>
            </div>
            <span
              class="album-hero-badge"
              :class="{
                'rank-gold': selectedAlbumIndex === 0,
                'rank-silver': selectedAlbumIndex === 1,
                'rank-bronze': selectedAlbumIndex === 2,
              }"
            >
              TOP {{ selectedAlbumIndex + 1 }}
            </span>
          </div>
          <div class="album-hero-info">
            <h3 class="album-hero-title">{{ selectedAlbumItem.title || '未知专辑' }}</h3>
            <p class="album-hero-artist">{{ formatRankingArtist(selectedAlbumItem.artist) }}</p>
          </div>
        </div>

        <!-- Right: Album Scroll List -->
        <ol class="archive-album-magazine-list">
          <li
            v-for="(item, index) in listeningRanking.items"
            :key="item.key"
            class="archive-album-magazine-item"
            :class="{ 'is-selected': index === selectedAlbumIndex }"
            @mouseenter="selectedAlbumIndex = index"
          >
            <span
              class="archive-ranking-rank"
              :class="{
                'rank-gold': index === 0,
                'rank-silver': index === 1,
                'rank-bronze': index === 2,
              }"
            >
              {{ index + 1 }}
            </span>
            <div class="archive-ranking-artwork">
              <img
                v-if="getArtworkUrl(item.artworkCacheKey)"
                :src="getArtworkUrl(item.artworkCacheKey) ?? undefined"
                alt=""
              />
              <span v-else class="i-lucide-disc h-4 w-4"></span>
            </div>
            <div class="archive-ranking-copy">
              <strong>{{ item.title || '未知专辑' }}</strong>
              <span>{{ formatRankingArtist(item.artist) }}</span>
            </div>
            <div class="archive-ranking-meta">
              <strong>{{ item.playCount }} 次</strong>
              <span>{{ formatMinutes(item.durationSeconds) }}</span>
            </div>
          </li>
        </ol>
      </div>
    </section>

    <Teleport to="body">
      <Transition name="archive-picker-fade">
        <div
          v-if="showRankingPicker"
          class="archive-picker-backdrop"
          @click="showRankingPicker = false"
        >
          <div
            class="archive-ranking-picker"
            :style="{
              top: `${pickerPos.top}px`,
              left: `${pickerPos.left}px`,
            }"
            @click.stop
          >
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

            <!-- Month / Year: lightweight period picker -->
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
              <div v-if="rankingRange === 'month'" class="picker-list">
                <button
                  v-for="month in rankingMonthOptions"
                  :key="`month-${month}`"
                  type="button"
                  :class="{ 'is-active': rankingMonth === month }"
                  @click="selectRankingMonth(month)"
                >
                  {{ month }}月
                </button>
              </div>
            </template>
          </div>
        </div>
      </Transition>

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
            <li
              v-for="(track, index) in dailyDetail.tracks"
              :key="track.trackId"
              :style="{ '--item-index': index }"
            >
              <span
                class="archive-track-rank"
                :class="{
                  'rank-gold': index === 0,
                  'rank-silver': index === 1,
                  'rank-bronze': index === 2,
                }"
                >{{ index + 1 }}</span
              >
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
        v-if="showAnnualRecap"
        class="archive-annual-recap-backdrop"
        @click.self="closeAnnualRecap"
      >
        <section
          class="archive-annual-recap-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="archive-annual-recap-title"
        >
          <header class="archive-annual-recap-header">
            <div>
              <span class="archive-section-kicker">Year in Review</span>
              <h2 id="archive-annual-recap-title">{{ selectedYear }} 年度总结</h2>
              <p>这一年留下的播放、收听时长和年度 Top 10。</p>
            </div>
            <button type="button" aria-label="关闭年度总结" @click="closeAnnualRecap">
              <span class="i-lucide-x h-4 w-4"></span>
            </button>
          </header>

          <div class="archive-annual-recap-content">
            <Transition name="archive-annual-recap-page" mode="out-in">
              <section
                v-if="annualRecapPage === 0"
                key="cover"
                class="archive-annual-recap-page archive-annual-recap-page--cover"
              >
                <span class="archive-section-kicker">Year in Review</span>
                <h3>{{ selectedYear }} 年度总结</h3>
                <p>这一年留下的声音轨迹，先从总时长开始。</p>
                <strong>
                  {{ formatHoursAndMinutes(annualRecapMetrics.totalDurationSeconds) }}
                </strong>
                <small>{{ annualRecapMetrics.totalPlays }} 次播放</small>
              </section>

              <section
                v-else-if="annualRecapPage === 1"
                key="overview"
                class="archive-annual-recap-page"
              >
                <div class="archive-annual-recap-section-heading">
                  <span>年度总览</span>
                  <small>{{ selectedYear }} 年</small>
                </div>
                <div class="archive-annual-recap-stats archive-annual-recap-stats--paged">
                  <div>
                    <span>听歌天数</span>
                    <strong>{{ annualRecapMetrics.listeningDays }}</strong>
                    <small>天</small>
                  </div>
                  <div>
                    <span>播放次数</span>
                    <strong>{{ annualRecapMetrics.totalPlays }}</strong>
                    <small>次</small>
                  </div>
                  <div>
                    <span>已收听</span>
                    <strong>{{ annualRecapMetrics.totalMinutes }}</strong>
                    <small>分钟</small>
                  </div>
                  <div>
                    <span>最活跃的一天</span>
                    <strong>{{ annualRecapMetrics.peakDayLabel }}</strong>
                    <small>{{ annualRecapMetrics.peakDayPlayCount }} 次</small>
                  </div>
                </div>
              </section>

              <section
                v-else-if="annualRecapPage === 2"
                key="tracks"
                class="archive-annual-recap-page"
              >
                <div class="archive-annual-recap-section-heading">
                  <span>年度 Top 10 单曲</span>
                  <small v-if="isAnnualRecapLoading">正在整理年度排行…</small>
                  <small v-else-if="annualRecapError">{{ annualRecapError }}</small>
                </div>
                <div v-if="isAnnualRecapLoading" class="archive-annual-recap-loading">
                  正在整理年度 Top 10…
                </div>
                <div v-else-if="annualRecapError" class="archive-annual-recap-loading">
                  {{ annualRecapError }}
                </div>
                <ol v-else-if="annualRecapTrackTop10.length" class="archive-annual-recap-list">
                  <li v-for="(item, index) in annualRecapTrackTop10" :key="item.key">
                    <span class="archive-annual-recap-rank">{{ index + 1 }}</span>
                    <div class="archive-annual-recap-artwork">
                      <img
                        v-if="getArtworkUrl(item.artworkCacheKey)"
                        :src="getArtworkUrl(item.artworkCacheKey) ?? undefined"
                        alt=""
                      />
                      <span v-else class="i-lucide-music-2 h-4 w-4"></span>
                    </div>
                    <strong>{{ item.title || '未知歌曲' }}</strong>
                    <div>
                      <span>{{ item.playCount }} 次</span>
                      <small>{{ formatMinutes(item.durationSeconds) }}</small>
                    </div>
                  </li>
                </ol>
                <p v-else class="archive-annual-recap-empty">暂无年度单曲数据</p>
              </section>

              <section
                v-else-if="annualRecapPage === 3"
                key="albums"
                class="archive-annual-recap-page"
              >
                <div class="archive-annual-recap-section-heading">
                  <span>年度 Top 10 专辑</span>
                  <small v-if="isAnnualRecapLoading">正在整理年度排行…</small>
                  <small v-else-if="annualRecapError">{{ annualRecapError }}</small>
                </div>
                <div v-if="isAnnualRecapLoading" class="archive-annual-recap-loading">
                  正在整理年度 Top 10…
                </div>
                <div v-else-if="annualRecapError" class="archive-annual-recap-loading">
                  {{ annualRecapError }}
                </div>
                <ol v-else-if="annualRecapAlbumTop10.length" class="archive-annual-recap-list">
                  <li v-for="(item, index) in annualRecapAlbumTop10" :key="item.key">
                    <span class="archive-annual-recap-rank">{{ index + 1 }}</span>
                    <div class="archive-annual-recap-artwork">
                      <img
                        v-if="getArtworkUrl(item.artworkCacheKey)"
                        :src="getArtworkUrl(item.artworkCacheKey) ?? undefined"
                        alt=""
                      />
                      <span v-else class="i-lucide-disc-3 h-4 w-4"></span>
                    </div>
                    <strong>{{ item.title || '未知专辑' }}</strong>
                    <div>
                      <span>{{ item.playCount }} 次</span>
                      <small>{{ formatMinutes(item.durationSeconds) }}</small>
                    </div>
                  </li>
                </ol>
                <p v-else class="archive-annual-recap-empty">暂无年度专辑数据</p>
              </section>

              <section v-else key="timeline" class="archive-annual-recap-page">
                <div class="archive-annual-recap-section-heading">
                  <span>时间轨迹</span>
                  <small>按当前年份统计</small>
                </div>
                <div class="archive-annual-recap-timeline">
                  <div>
                    <span>最常听的月份</span>
                    <strong>{{ annualRecapMetrics.mostActiveMonthLabel }}</strong>
                  </div>
                  <div>
                    <span>最常听的星期</span>
                    <strong>{{ annualRecapMetrics.mostActiveWeekdayLabel }}</strong>
                  </div>
                  <div>
                    <span>最长连续聆听</span>
                    <strong>{{ annualRecapMetrics.longestStreak }} 天</strong>
                  </div>
                </div>
                <div class="archive-annual-recap-bars" aria-label="12 个月播放热度">
                  <div
                    v-for="bar in annualRecapMetrics.monthBars"
                    :key="bar.month"
                    :title="`${bar.month}月 · ${bar.playCount} 次`"
                  >
                    <span :style="{ height: `${bar.height}%` }"></span>
                    <small>{{ bar.month }}月</small>
                  </div>
                </div>
              </section>
            </Transition>
          </div>

          <footer class="archive-annual-recap-footer">
            <button
              type="button"
              :disabled="annualRecapPage === 0"
              @click="goToPreviousAnnualRecapPage"
            >
              上一页
            </button>
            <div class="archive-annual-recap-dots" aria-label="年度总结分页">
              <button
                v-for="page in ANNUAL_RECAP_PAGE_COUNT"
                :key="page"
                type="button"
                :class="{ 'is-active': annualRecapPage === page - 1 }"
                :aria-label="`跳转到第 ${page} 页`"
                @click="setAnnualRecapPage(page - 1)"
              ></button>
            </div>
            <button
              type="button"
              :disabled="annualRecapPage === ANNUAL_RECAP_PAGE_COUNT - 1"
              @click="goToNextAnnualRecapPage"
            >
              下一页
            </button>
          </footer>
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
  --archive-panel-bg: color-mix(in srgb, var(--auralis-sidebar-bg) 65%, transparent);
  --archive-panel-border: color-mix(in srgb, var(--auralis-text) 8%, transparent);
  --archive-panel-shadow: 0 16px 36px color-mix(in srgb, var(--auralis-text) 5%, transparent);
  --archive-accent-soft: color-mix(
    in srgb,
    var(--auralis-sidebar-active-indicator) 12%,
    transparent
  );
  min-height: 100%;
  padding-bottom: calc(var(--auralis-playbar-safe-area) + 40px);
}

:global(body.archive-page-scrollbar-hidden .app-main) {
  scrollbar-width: none;
}

:global(body.archive-page-scrollbar-hidden .app-main::-webkit-scrollbar) {
  display: none;
}

.archive-section-kicker {
  display: block;
  color: var(--auralis-sidebar-active-indicator);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  line-height: 1;
  margin-bottom: 8px;
}

.archive-card-heading,
.archive-section-heading,
.archive-ranking-heading,
.archive-ranking-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.archive-title-row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.archive-title-row h2 {
  cursor: default;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.archive-title-row h2:focus-visible {
  border-radius: 5px;
  outline: 2px solid color-mix(in srgb, var(--auralis-sidebar-active-indicator) 58%, transparent);
  outline-offset: 4px;
}

.archive-reset-action {
  height: 30px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, #d94a4a 24%, transparent);
  border-radius: 15px;
  color: #d94a4a;
  background: color-mix(in srgb, #d94a4a 8%, transparent);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  transition: all 200ms ease;
}

.archive-reset-action:hover {
  color: #fff;
  background: #d94a4a;
  border-color: #d94a4a;
  box-shadow: 0 4px 12px rgba(217, 74, 74, 0.3);
}

.archive-reset-action-enter-active,
.archive-reset-action-leave-active {
  transition:
    opacity 200ms ease,
    transform 200ms ease;
}

.archive-reset-action-enter-from,
.archive-reset-action-leave-to {
  opacity: 0;
  transform: translateX(-6px);
}

.archive-card-heading p,
.archive-section-heading p {
  margin: 0;
  color: var(--auralis-text-muted);
  font-size: 13px;
  line-height: 1.65;
}

/* Glassmorphism Panel styles */
.archive-heatmap-card {
  padding: 24px;
  border: 1px solid var(--archive-panel-border);
  border-radius: 16px;
  background: var(--archive-panel-bg);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  box-shadow:
    var(--archive-panel-shadow),
    inset 0 1px 0 color-mix(in srgb, white 15%, transparent);
  transition:
    border-color 0.3s ease,
    box-shadow 0.3s ease;
}

.archive-heatmap-card:hover {
  border-color: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 24%, transparent);
  box-shadow:
    0 20px 48px color-mix(in srgb, var(--auralis-text) 8%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 20%, transparent);
}

.archive-card-heading h2,
.archive-section-heading h2,
.archive-ranking-heading h2 {
  color: var(--auralis-text);
  font-size: 20px;
  font-weight: 800;
  line-height: 1.2;
}

.archive-card-heading p,
.archive-section-heading p {
  margin-top: 6px;
}

.archive-legend {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--auralis-text-faint);
  font-size: 11px;
  white-space: nowrap;
  background: color-mix(in srgb, var(--auralis-text) 4%, transparent);
  padding: 4px 10px;
  border-radius: 12px;
}

.archive-legend i {
  width: 12px;
  height: 12px;
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
  margin-top: 22px;
  overflow-x: auto;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--auralis-text) 6%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--auralis-main-bg) 40%, transparent);
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
    transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1),
    box-shadow 150ms ease,
    background-color 150ms ease;
}

.archive-day:hover,
.archive-day:focus-visible {
  z-index: 2;
  box-shadow:
    0 0 0 2px var(--auralis-main-bg),
    0 0 8px var(--auralis-sidebar-active-indicator);
  transform: scale(1.35);
}

.heat-level-0 {
  background: var(--auralis-control-hover-bg);
}

.heat-level-1 {
  background: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 28%, transparent);
}

.heat-level-2 {
  background: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 48%, transparent);
}

.heat-level-3 {
  background: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 72%, transparent);
}

.heat-level-4 {
  background: var(--auralis-sidebar-active-indicator);
  box-shadow: 0 0 6px color-mix(in srgb, var(--auralis-sidebar-active-indicator) 50%, transparent);
}

.archive-day--future {
  opacity: 0.25;
}

.archive-summary {
  margin-top: 28px;
}

.archive-summary-grid {
  display: grid;
  margin-top: 16px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

/* Summary Cards (Borderless Streamline Layout) */
.archive-summary-item {
  position: relative;
  z-index: 1;
  min-width: 0;
  min-height: 140px;
  padding: 20px;
  border: 1px solid transparent;
  border-radius: 16px;
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  outline: none;
  box-shadow: none;
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
  overflow: visible;
}

/* Subtle glow background for each card based on its child index */
.archive-summary-item:nth-child(1) {
  --glow-color: rgba(111, 125, 99, 0.35);
} /* Moss 绿 */
.archive-summary-item:nth-child(2) {
  --glow-color: rgba(164, 124, 72, 0.35);
} /* Brass 金 */
.archive-summary-item:nth-child(3) {
  --glow-color: rgba(93, 103, 115, 0.35);
} /* Dusk 蓝 */
.archive-summary-item:nth-child(4) {
  --glow-color: rgba(74, 111, 165, 0.35);
} /* Auralis 蓝 */

.archive-summary-item::before {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(
    circle at 85% 15%,
    var(--glow-color, transparent) 0%,
    transparent 60%
  );
  content: '';
  opacity: 0.35;
  z-index: -1;
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
  pointer-events: none;
}

.archive-summary-item:hover,
.archive-summary-item:focus-within {
  z-index: 20;
  border-color: transparent;
  background: color-mix(in srgb, var(--auralis-text) 3.5%, transparent);
  box-shadow: 0 12px 28px color-mix(in srgb, var(--auralis-text) 4%, transparent);
  transform: translateY(-2px);
}

.archive-summary-item:hover::before {
  opacity: 0.6;
}

.archive-summary-item:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--auralis-sidebar-active-indicator) 50%, transparent);
}

.archive-summary-item--clickable {
  cursor: pointer;
}

.archive-summary-item > .archive-summary-label,
.archive-summary-item > .archive-summary-value {
  transition:
    opacity 150ms ease,
    transform 200ms ease;
}

.archive-summary-item:hover > .archive-summary-label,
.archive-summary-item:hover > .archive-summary-value,
.archive-summary-item:focus-within > .archive-summary-label,
.archive-summary-item:focus-within > .archive-summary-value {
  opacity: 0;
  transform: translateY(-6px);
}

.archive-summary-label {
  display: block;
  color: var(--auralis-text-muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.archive-summary-value {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 7px;
  margin-top: 20px;
  color: var(--auralis-text);
}

.archive-summary-value strong {
  overflow: hidden;
  font-size: 34px;
  font-weight: 800;
  font-family: 'Outfit', 'Inter', sans-serif;
  letter-spacing: -0.02em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-summary-value span {
  flex-shrink: 0;
  color: var(--auralis-text-faint);
  font-size: 12px;
  font-weight: 600;
}

/* Expanded Card content in Summary grid */
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
  border-radius: 16px;
  background: color-mix(in srgb, var(--auralis-dialog-bg) 80%, transparent);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
  -webkit-backdrop-filter: blur(25px) saturate(150%);
  backdrop-filter: blur(25px) saturate(150%);
  grid-template-columns: minmax(0, 0.88fr) minmax(0, 1.2fr);
  column-gap: 20px;
  isolation: isolate;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, -50%) scale(0.85);
  transition:
    opacity 200ms ease,
    transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.archive-summary-expanded::before {
  position: absolute;
  z-index: 0;
  border-radius: inherit;
  background:
    linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.12) 0%,
      rgba(255, 255, 255, 0.04) 18%,
      transparent 48%,
      rgba(0, 0, 0, 0.15) 100%
    ),
    radial-gradient(circle at 15% 15%, var(--glow-color, transparent) 0%, transparent 60%);
  content: '';
  inset: 0;
  opacity: 0.8;
  pointer-events: none;
}

.archive-summary-item:first-child .archive-summary-expanded {
  left: 0;
  transform: translate(0, -50%) scale(0.85);
  transform-origin: left center;
}

.archive-summary-item:last-child .archive-summary-expanded {
  right: 0;
  left: auto;
  transform: translate(0, -50%) scale(0.85);
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
  font-size: 32px;
  letter-spacing: -0.04em;
  background: none;
  -webkit-text-fill-color: initial;
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
  border-left: 1px solid color-mix(in srgb, var(--auralis-text) 12%, transparent);
  color: color-mix(in srgb, var(--auralis-text) 80%, transparent);
  font-size: 13px;
  font-weight: 560;
  line-height: 1.4;
}

.archive-summary-details span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-summary-top-track,
.archive-summary-top-tracks {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.archive-summary-details .archive-summary-top-track-label,
.archive-summary-details .archive-summary-top-tracks-label {
  color: color-mix(in srgb, var(--auralis-text) 50%, transparent);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.archive-summary-details .archive-summary-top-track-value,
.archive-summary-details .archive-summary-top-tracks-value {
  overflow: hidden;
  color: var(--auralis-text);
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-summary-details .archive-summary-top-tracks-value {
  display: -webkit-box;
  line-height: 1.4;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.archive-summary-details small {
  align-self: flex-start;
  margin-top: 4px;
  color: var(--auralis-sidebar-active-indicator);
  font-size: 11px;
  font-weight: 700;
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

.archive-summary-item--peak-day .archive-summary-expanded-main .archive-summary-value {
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.archive-summary-item--peak-day .archive-summary-expanded-main .archive-summary-value strong {
  font-size: 24px;
  letter-spacing: -0.05em;
  line-height: 1.2;
}

.archive-summary-item--peak-day .archive-summary-expanded-main .archive-summary-value span {
  margin-top: 2px;
  font-size: 11px;
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

.archive-annual-recap-entry {
  display: inline-flex;
  height: 36px;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  border: 1px solid var(--archive-panel-border);
  border-radius: 18px;
  background: color-mix(in srgb, var(--auralis-main-bg) 46%, transparent);
  color: var(--auralis-sidebar-active-indicator);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  transition: all 200ms ease;
}

.archive-annual-recap-entry:hover {
  border-color: var(--auralis-sidebar-active-indicator);
  background: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 12%, transparent);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px
    color-mix(in srgb, var(--auralis-sidebar-active-indicator) 20%, transparent);
}

.archive-annual-recap-backdrop {
  position: fixed;
  z-index: 115;
  display: flex;
  align-items: center;
  justify-content: center;
  inset: 0;
  padding: 28px;
  background: rgba(12, 16, 20, 0.65);
  backdrop-filter: blur(8px);
  animation: archive-reset-backdrop-in 240ms ease both;
}

/* Recap Dialog Glassmorphism */
.archive-annual-recap-dialog {
  display: flex;
  width: min(980px, calc(100vw - 56px));
  max-height: min(760px, calc(100vh - 72px));
  overflow: hidden;
  flex-direction: column;
  border: 1px solid color-mix(in srgb, var(--auralis-text) 10%, transparent);
  border-radius: 24px;
  background: color-mix(in srgb, var(--auralis-dialog-bg) 80%, transparent);
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.35);
  color: var(--auralis-text);
  -webkit-backdrop-filter: blur(30px) saturate(160%);
  backdrop-filter: blur(30px) saturate(160%);
  animation: archive-reset-dialog-in 300ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.archive-annual-recap-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 26px 28px 18px;
  border-bottom: 1px solid color-mix(in srgb, var(--auralis-text) 8%, transparent);
}

.archive-annual-recap-header h2 {
  color: var(--auralis-text);
  font-size: 28px;
  font-weight: 800;
  line-height: 1.12;
}

.archive-annual-recap-header p {
  margin-top: 8px;
  color: var(--auralis-text-muted);
  font-size: 13px;
}

.archive-annual-recap-header button {
  display: inline-flex;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 99px;
  color: var(--auralis-text-muted);
  transition: all 150ms ease;
}

.archive-annual-recap-header button:hover {
  background: var(--auralis-control-hover-bg);
  color: var(--auralis-text);
  transform: rotate(90deg);
}

.archive-annual-recap-content {
  position: relative;
  overflow: hidden;
  padding: 22px 28px 18px;
}

.archive-annual-recap-page {
  display: flex;
  min-height: 468px;
  flex-direction: column;
  padding: 24px;
  border: 1px solid color-mix(in srgb, var(--auralis-text) 8%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--auralis-sidebar-bg) 60%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 15%, transparent);
}

.archive-annual-recap-page--cover {
  justify-content: center;
  overflow: hidden;
  background:
    radial-gradient(
      circle at 82% 18%,
      color-mix(in srgb, var(--auralis-sidebar-active-indicator) 24%, transparent),
      transparent 35%
    ),
    color-mix(in srgb, var(--auralis-sidebar-bg) 60%, transparent);
}

.archive-annual-recap-page--cover h3 {
  margin-top: 12px;
  color: var(--auralis-text);
  font-size: 48px;
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.04em;
}

.archive-annual-recap-page--cover p {
  max-width: 360px;
  margin-top: 14px;
  color: var(--auralis-text-muted);
  font-size: 14px;
  line-height: 1.65;
}

.archive-annual-recap-page--cover strong {
  margin-top: 42px;
  color: var(--auralis-text);
  font-size: 56px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.05em;
  background: linear-gradient(
    135deg,
    var(--auralis-text) 40%,
    var(--auralis-sidebar-active-indicator)
  );
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.archive-annual-recap-page--cover small {
  margin-top: 12px;
  color: var(--auralis-text-faint);
  font-size: 13px;
  font-weight: 700;
}

.archive-annual-recap-stats span,
.archive-annual-recap-timeline span {
  color: var(--auralis-text-muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.archive-annual-recap-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.archive-annual-recap-stats--paged {
  flex: 1;
  align-content: center;
}

.archive-annual-recap-stats > div {
  min-width: 0;
  padding: 20px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--auralis-text) 5%, transparent);
  background: color-mix(in srgb, var(--auralis-sidebar-bg) 40%, transparent);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.archive-annual-recap-stats strong {
  display: block;
  overflow: hidden;
  margin-top: 12px;
  color: var(--auralis-text);
  font-size: 32px;
  font-weight: 800;
  font-family: 'Outfit', 'Inter', sans-serif;
  line-height: 1.05;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-annual-recap-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.archive-annual-recap-section-heading > span {
  color: var(--auralis-text);
  font-size: 16px;
  font-weight: 800;
}

.archive-annual-recap-section-heading small {
  color: var(--auralis-text-faint);
  font-size: 11px;
}

.archive-annual-recap-list {
  display: grid;
  gap: 6px;
  list-style: none;
}

.archive-annual-recap-list li {
  display: grid;
  min-width: 0;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid transparent;
  grid-template-columns: 28px 38px minmax(0, 1fr) auto;
  transition: all 150ms ease;
}

.archive-annual-recap-list li:hover {
  background: color-mix(in srgb, var(--auralis-control-hover-bg) 74%, transparent);
  border-color: color-mix(in srgb, var(--auralis-text) 5%, transparent);
}

.archive-annual-recap-rank,
.archive-annual-recap-list li small {
  color: var(--auralis-text-faint);
  font-size: 10px;
}

.archive-annual-recap-artwork {
  display: flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 8px;
  background: var(--auralis-control-hover-bg);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--auralis-text-faint);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.archive-annual-recap-artwork img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.archive-annual-recap-list li strong {
  overflow: hidden;
  color: var(--auralis-text);
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-annual-recap-list li > div:last-child {
  display: flex;
  align-items: flex-end;
  flex-direction: column;
  gap: 2px;
  color: var(--auralis-text-muted);
  font-size: 11px;
  white-space: nowrap;
}

.archive-annual-recap-empty,
.archive-annual-recap-loading {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  color: var(--auralis-text-muted);
  font-size: 13px;
}

.archive-annual-recap-timeline {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.archive-annual-recap-timeline div {
  min-width: 0;
  padding: 16px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--auralis-text) 5%, transparent);
  background: color-mix(in srgb, var(--auralis-sidebar-bg) 40%, transparent);
}

.archive-annual-recap-timeline strong {
  display: block;
  overflow: hidden;
  margin-top: 8px;
  color: var(--auralis-text);
  font-size: 17px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.archive-annual-recap-bars {
  display: grid;
  height: 128px;
  align-items: end;
  gap: 8px;
  margin-top: 20px;
  grid-template-columns: repeat(12, minmax(0, 1fr));
}

.archive-annual-recap-bars div {
  display: flex;
  min-width: 0;
  height: 100%;
  align-items: center;
  flex-direction: column;
  justify-content: flex-end;
  gap: 7px;
}

.archive-annual-recap-bars div > span {
  display: block;
  width: 100%;
  border-radius: 999px 999px 4px 4px;
  background: linear-gradient(
    0deg,
    color-mix(in srgb, var(--auralis-sidebar-active-indicator) 48%, transparent),
    var(--auralis-sidebar-active-indicator)
  );
  box-shadow: 0 2px 6px color-mix(in srgb, var(--auralis-sidebar-active-indicator) 30%, transparent);
}

.archive-annual-recap-bars small {
  color: var(--auralis-text-faint);
  font-size: 10px;
}

.archive-annual-recap-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 0 28px 22px;
}

.archive-annual-recap-footer > button {
  height: 34px;
  min-width: 74px;
  padding: 0 14px;
  border-radius: 17px;
  background: var(--auralis-control-hover-bg);
  border: 1px solid color-mix(in srgb, var(--auralis-text) 5%, transparent);
  color: var(--auralis-text);
  font-size: 12px;
  font-weight: 700;
  transition: all 150ms ease;
}

.archive-annual-recap-footer > button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--auralis-text) 11%, transparent);
  transform: translateY(-1px);
}

.archive-annual-recap-footer > button:disabled {
  cursor: default;
  opacity: 0.34;
}

.archive-annual-recap-dots {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.archive-annual-recap-dots button {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--auralis-text) 20%, transparent);
  transition:
    width 180ms ease,
    background-color 180ms ease;
}

.archive-annual-recap-dots button.is-active {
  width: 22px;
  background: var(--auralis-sidebar-active-indicator);
}

.archive-annual-recap-page-enter-active,
.archive-annual-recap-page-leave-active {
  transition:
    opacity 180ms ease,
    transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.archive-annual-recap-page-enter-from {
  opacity: 0;
  transform: translateX(18px);
}

.archive-annual-recap-page-leave-to {
  opacity: 0;
  transform: translateX(-18px);
}

/* Ranking Card Glassmorphism */
.archive-ranking {
  margin-top: 24px;
  margin-bottom: 16px;
  padding: 24px;
  border: 1px solid var(--archive-panel-border);
  border-radius: 16px;
  background: var(--archive-panel-bg);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  box-shadow:
    var(--archive-panel-shadow),
    inset 0 1px 0 color-mix(in srgb, white 15%, transparent);
  transition:
    border-color 0.3s ease,
    box-shadow 0.3s ease;
}

.archive-ranking:hover {
  border-color: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 24%, transparent);
  box-shadow:
    0 20px 48px color-mix(in srgb, var(--auralis-text) 8%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 20%, transparent);
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
  gap: 5px;
  padding: 4px;
  border: 1px solid var(--archive-panel-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--auralis-main-bg) 44%, transparent);
}

.archive-ranking-ranges button,
.archive-ranking-targets button,
.archive-ranking-period > button,
.archive-ranking-period-menu button {
  border-radius: 8px;
  color: var(--auralis-text-muted);
  font-size: 12px;
  font-weight: 700;
  transition: all 150ms ease;
}

.archive-ranking-ranges button,
.archive-ranking-targets button {
  height: 28px;
  padding: 0 12px;
}

.archive-ranking-targets button {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  padding: 0;
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
  background: var(--auralis-sidebar-active-indicator);
  color: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}

.archive-ranking-toolbar {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid color-mix(in srgb, var(--auralis-text) 7%, transparent);
}

.archive-ranking-period {
  position: relative;
}

.archive-ranking-period > button {
  display: inline-flex;
  height: 38px;
  align-items: center;
  gap: 7px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid var(--archive-panel-border);
  background: color-mix(in srgb, var(--auralis-main-bg) 44%, transparent);
}

.archive-picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9990;
  background: rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(12px) saturate(130%);
  -webkit-backdrop-filter: blur(12px) saturate(130%);
  transition: opacity 220ms ease;
}

.archive-picker-fade-enter-from,
.archive-picker-fade-leave-to {
  opacity: 0;
}

.archive-ranking-picker {
  position: fixed;
  z-index: 10000;
  transform: translate(-100%, -100%);
  min-width: 240px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--auralis-text) 16%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--auralis-dialog-bg) 96%, #000);
  box-shadow:
    0 32px 80px rgba(0, 0, 0, 0.8),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px 10px;
  margin-bottom: 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--auralis-text) 8%, transparent);
  color: var(--auralis-text);
  font-size: 13px;
  font-weight: 700;
}

.picker-header button {
  display: inline-flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: var(--auralis-text-muted);
  transition: all 150ms ease;
}

.picker-header button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--auralis-text) 8%, transparent);
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
  margin-bottom: 6px;
  color: var(--auralis-text-faint);
  font-size: 10px;
  text-align: center;
  font-weight: 700;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 3px;
}

.calendar-grid button {
  display: flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: var(--auralis-text);
  font-size: 12px;
  font-weight: 600;
  transition: all 120ms ease;
}

.calendar-grid button:not(.is-empty):not(:disabled):hover {
  background: color-mix(in srgb, var(--auralis-text) 7%, transparent);
}

.calendar-grid button.is-empty {
  cursor: default;
}

.calendar-grid button:disabled {
  opacity: 0.35;
  cursor: default;
}

.calendar-grid button.is-today {
  color: var(--auralis-active-album-accent, #ffe57f);
  font-weight: 800;
  box-shadow: inset 0 0 0 1px
    color-mix(in srgb, var(--auralis-active-album-accent, #ffe57f) 40%, transparent);
}

.calendar-grid button.is-selected {
  background: linear-gradient(
    135deg,
    var(--auralis-active-album-accent, #4f46e5) 0%,
    color-mix(in srgb, var(--auralis-active-album-accent, #4f46e5) 80%, #000) 100%
  );
  color: #ffffff;
  font-weight: 800;
  box-shadow: 0 4px 14px
    color-mix(in srgb, var(--auralis-active-album-accent, #4f46e5) 45%, transparent);
}

/* Week list */
.picker-week-list {
  display: grid;
  max-height: 240px;
  gap: 3px;
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

.picker-week-list button {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  color: var(--auralis-text);
  font-size: 12px;
  font-weight: 600;
  text-align: left;
  transition: all 120ms ease;
}

.picker-week-list button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--auralis-text) 7%, transparent);
}

.picker-week-list button:disabled {
  opacity: 0.35;
  cursor: default;
}

.picker-week-list button.is-active,
.picker-week-list button.is-current {
  background: linear-gradient(
    135deg,
    var(--auralis-active-album-accent, #4f46e5) 0%,
    color-mix(in srgb, var(--auralis-active-album-accent, #4f46e5) 80%, #000) 100%
  );
  color: #ffffff;
  font-weight: 700;
  box-shadow: 0 4px 12px
    color-mix(in srgb, var(--auralis-active-album-accent, #4f46e5) 40%, transparent);
}

.picker-week-list .week-date-range {
  margin-left: auto;
  color: var(--auralis-text-faint);
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}

/* Month list */
.picker-list {
  display: grid;
  min-width: 160px;
  gap: 3px;
  padding: 2px 0;
}

.picker-list button {
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  color: var(--auralis-text-muted);
  font-size: 12px;
  font-weight: 700;
  text-align: left;
  transition: all 150ms ease;
}

.picker-list button:hover {
  background: var(--auralis-control-hover-bg);
  color: var(--auralis-text);
}

.picker-list button.is-active {
  background: var(--auralis-sidebar-active-indicator);
  color: #fff;
}

/* "回到今天" / "回到本周" button */
.picker-today-btn {
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 7px 0;
  border-radius: 8px;
  color: var(--auralis-sidebar-active-indicator);
  font-size: 11px;
  font-weight: 700;
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
  margin-top: 14px;
  border: 1px solid color-mix(in srgb, var(--auralis-text) 7%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--auralis-main-bg) 38%, transparent);
  color: var(--auralis-text-muted);
  font-size: 13px;
}

.archive-ranking-list {
  display: grid;
  gap: 6px;
  margin-top: 14px;
  max-height: 620px;
  overflow-y: auto;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--auralis-text) 7%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--auralis-main-bg) 38%, transparent);
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

.archive-ranking-list li {
  display: grid;
  min-width: 0;
  align-items: center;
  padding: 10px 14px;
  border: 1px solid transparent;
  border-radius: 12px;
  grid-template-columns: 36px 48px minmax(0, 1fr) auto;
  gap: 14px;
  background: rgba(255, 255, 255, 0.015);
  transition: all 250ms cubic-bezier(0.2, 0.8, 0.2, 1);
  position: relative;
}

.archive-ranking-list li:hover {
  border-color: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 24%, transparent);
  background: color-mix(in srgb, var(--auralis-sidebar-active-indicator) 8%, transparent);
  box-shadow: 0 8px 20px color-mix(in srgb, var(--auralis-text) 4%, transparent);
  transform: translateX(4px) scale(1.005);
}

/* Redesigned Rankings with metallic shades for Top 3 */
.archive-ranking-rank {
  font-family: 'Outfit', 'Inter', sans-serif;
  color: var(--auralis-text-faint);
  font-size: 15px;
  font-weight: 700;
  text-align: center;
  transition: transform 0.2s ease;
}

.archive-ranking-list li:nth-child(1) .archive-ranking-rank {
  color: #ffd700;
  font-size: 20px;
  font-weight: 800;
  text-shadow: 0 0 10px rgba(255, 215, 0, 0.45);
}

.archive-ranking-list li:nth-child(2) .archive-ranking-rank {
  color: #c0c0c0;
  font-size: 20px;
  font-weight: 800;
  text-shadow: 0 0 10px rgba(192, 192, 192, 0.45);
}

.archive-ranking-list li:nth-child(3) .archive-ranking-rank {
  color: #cd7f32;
  font-size: 20px;
  font-weight: 800;
  text-shadow: 0 0 10px rgba(205, 127, 50, 0.45);
}

.archive-ranking-list li:hover .archive-ranking-rank {
  transform: scale(1.15);
}

.archive-ranking-artwork {
  display: flex;
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 8px;
  background: var(--auralis-control-hover-bg);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
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
  font-size: 14px;
  font-weight: 700;
}

.archive-ranking-copy span,
.archive-ranking-meta span {
  color: var(--auralis-text-muted);
  font-size: 11px;
  font-weight: 600;
}

.archive-ranking-meta {
  align-items: flex-end;
  gap: 3px;
  white-space: nowrap;
}

.archive-ranking-meta strong {
  color: var(--auralis-text);
  font-size: 13px;
  font-weight: 700;
  font-family: 'Outfit', 'Inter', sans-serif;
}

.archive-tooltip {
  position: fixed;
  z-index: 90;
  padding: 6px 10px;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 8px;
  background: color-mix(in srgb, var(--auralis-sidebar-bg) 85%, transparent);
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
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
  backdrop-filter: blur(0px);
}

.archive-detail-backdrop.is-visible {
  background: rgba(12, 16, 20, 0.5);
  backdrop-filter: blur(6px);
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
  background: rgba(12, 16, 20, 0.5);
  backdrop-filter: blur(6px);
  animation: archive-reset-backdrop-in 180ms ease both;
}

/* Reset dialog Glassmorphism */
.archive-reset-dialog {
  width: min(430px, calc(100vw - 40px));
  padding: 28px;
  border: 1px solid color-mix(in srgb, var(--auralis-text) 10%, transparent);
  border-radius: 20px;
  background: color-mix(in srgb, var(--auralis-dialog-bg) 80%, transparent);
  backdrop-filter: blur(25px);
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.32);
  color: var(--auralis-text);
  animation: archive-reset-dialog-in 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.archive-reset-dialog h2 {
  font-size: 20px;
  font-weight: 800;
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
  gap: 10px;
  margin-top: 26px;
}

.archive-reset-buttons button {
  width: 82px;
  min-width: 82px;
  height: 34px;
  padding: 0 14px;
  border-radius: 17px;
  background: var(--auralis-control-hover-bg);
  border: 1px solid color-mix(in srgb, var(--auralis-text) 5%, transparent);
  color: var(--auralis-text);
  font-size: 12px;
  font-weight: 700;
  transition: all 150ms ease;
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
  border: none;
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
  width: 82px;
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

/* Daily Details Dialog Glassmorphism */
.archive-detail-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  display: flex;
  flex-direction: column;
  width: min(520px, calc(100vw - 40px));
  height: min(650px, calc(100vh - 80px));
  padding: 24px;
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--auralis-text) 12%, transparent);
  background: color-mix(in srgb, var(--auralis-dialog-bg) 88%, #000);
  backdrop-filter: blur(35px) contrast(105%);
  -webkit-backdrop-filter: blur(35px) contrast(105%);
  box-shadow:
    0 32px 90px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  color: var(--auralis-text);
  opacity: 0;
  pointer-events: none;
  transform: translate(calc(var(--dialog-origin-x) - 50vw), calc(var(--dialog-origin-y) - 50vh))
    scale(0.18);
  transform-origin: center;
  will-change: transform, opacity;
  transition:
    transform 260ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 180ms ease;
}

.archive-detail-dialog.is-expanded {
  opacity: 1;
  pointer-events: auto;
  transform: translate(-50%, -50%) scale(1);
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

.archive-detail-dialog.is-expanded .archive-top-tracks li {
  animation: archive-item-slide-in 340ms cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: calc(var(--item-index) * 35ms + 120ms);
}

@keyframes archive-item-slide-in {
  0% {
    opacity: 0;
    transform: translateY(14px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.archive-detail-header {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--auralis-text) 8%, transparent);
}

.archive-detail-header > div > span {
  color: var(--auralis-text-muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.archive-detail-header h2 {
  margin-top: 4px;
  font-size: 22px;
  font-weight: 800;
}

.archive-detail-header p {
  margin-top: 5px;
  color: var(--auralis-text-faint);
  font-size: 12px;
  font-weight: 600;
}

.archive-detail-header button {
  display: inline-flex;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 99px;
  color: var(--auralis-text-muted);
  transition: all 150ms ease;
}

.archive-detail-header button:hover {
  background: var(--auralis-control-hover-bg);
  color: var(--auralis-text);
  transform: rotate(90deg);
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
  align-content: start;
  grid-auto-rows: 54px;
  gap: 6px;
  margin-top: 16px;
  overflow-y: auto;
  padding: 8px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 14px;
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.4);
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

.archive-top-tracks li {
  display: grid;
  min-width: 0;
  height: 54px;
  align-items: center;
  padding: 8px 12px;
  border-radius: 10px;
  grid-template-columns: 22px 38px minmax(0, 1fr) auto;
  gap: 12px;
  border: 1px solid transparent;
  transition:
    background 160ms ease,
    border-color 160ms ease;
}

.archive-top-tracks li:hover {
  background: color-mix(in srgb, var(--auralis-text) 7%, transparent);
  border-color: rgba(255, 255, 255, 0.06);
}

.archive-track-rank,
.archive-track-count {
  color: var(--auralis-text-faint);
  font-size: 11px;
}

.archive-track-rank {
  text-align: center;
  font-weight: 700;
}

.archive-track-rank.rank-gold {
  background: linear-gradient(135deg, #ffe57f 0%, #ffb300 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  font-weight: 800;
  filter: drop-shadow(0 2px 4px rgba(255, 179, 0, 0.4));
}

.archive-track-rank.rank-silver {
  background: linear-gradient(135deg, #ffffff 0%, #b0bec5 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  font-weight: 800;
  filter: drop-shadow(0 2px 4px rgba(255, 255, 255, 0.4));
}

.archive-track-rank.rank-bronze {
  background: linear-gradient(135deg, #ffcc80 0%, #d84315 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  font-weight: 800;
  filter: drop-shadow(0 2px 4px rgba(216, 67, 21, 0.4));
}

.archive-track-artwork {
  display: flex;
  width: 38px;
  height: 38px;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 6px;
  background: var(--auralis-control-hover-bg);
  border: 1px solid rgba(255, 255, 255, 0.08);
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
  font-weight: 700;
}

.archive-track-copy span {
  color: var(--auralis-text-muted);
  font-size: 11px;
  font-weight: 600;
}

.archive-track-count {
  padding-left: 8px;
  white-space: nowrap;
  font-weight: 700;
}

@media (max-width: 900px) {
  .archive-card-heading,
  .archive-section-heading,
  .archive-ranking-heading,
  .archive-ranking-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .archive-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .archive-ranking-ranges {
    width: 100%;
    justify-content: space-between;
  }

  .archive-annual-recap-dialog {
    width: calc(100vw - 36px);
    max-height: calc(100vh - 52px);
  }

  .archive-annual-recap-timeline {
    grid-template-columns: 1fr;
  }

  .archive-annual-recap-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .archive-summary-item:nth-child(odd) .archive-summary-expanded {
    right: auto;
    left: 0;
    transform: translate(0, -50%) scale(0.85);
    transform-origin: left center;
  }

  .archive-summary-item:nth-child(even) .archive-summary-expanded {
    right: 0;
    left: auto;
    transform: translate(0, -50%) scale(0.85);
    transform-origin: right center;
  }

  .archive-summary-item:nth-child(n):hover .archive-summary-expanded,
  .archive-summary-item:nth-child(n):focus-within .archive-summary-expanded {
    transform: translate(0, -50%) scale(1);
  }
}

@media (max-width: 640px) {
  .archive-heatmap-card,
  .archive-ranking {
    padding: 18px;
  }

  .archive-annual-recap-backdrop {
    padding: 14px;
  }

  .archive-annual-recap-header,
  .archive-annual-recap-content {
    padding-right: 18px;
    padding-left: 18px;
  }

  .archive-annual-recap-page {
    min-height: 430px;
    padding: 18px;
  }

  .archive-annual-recap-page--cover h3 {
    font-size: 34px;
  }

  .archive-annual-recap-page--cover strong {
    font-size: 40px;
  }

  .archive-annual-recap-footer {
    padding-right: 18px;
    padding-left: 18px;
  }

  .archive-annual-recap-stats,
  .archive-annual-recap-bars {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .archive-annual-recap-bars {
    height: auto;
  }

  .archive-annual-recap-bars div {
    height: 84px;
  }

  .archive-summary-grid {
    grid-template-columns: 1fr;
  }

  .archive-summary-expanded {
    display: none;
  }

  .archive-summary-item:hover > .archive-summary-label,
  .archive-summary-item:hover > .archive-summary-value,
  .archive-ranking-meta {
    display: none;
  }
}

/* Editorial Magazine Layout for Album Ranking */
.archive-album-magazine-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 20px;
  align-items: start;
  padding: 4px 0;
}

.album-hero-stage {
  position: sticky;
  top: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  text-align: center;
  padding: 22px 18px 20px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--auralis-dialog-bg) 88%, #000);
  border: 1px solid color-mix(in srgb, var(--auralis-text) 10%, transparent);
  /* Depth first; soft palette glow rings outside (no color transition — instant on switch) */
  box-shadow:
    0 20px 50px rgba(0, 0, 0, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 0 0 1px color-mix(in srgb, var(--album-hero-glow, rgb(64 92 128)) 22%, transparent),
    0 0 22px color-mix(in srgb, var(--album-hero-glow, rgb(64 92 128)) 38%, transparent),
    0 0 48px color-mix(in srgb, var(--album-hero-glow, rgb(64 92 128)) 18%, transparent);
  backdrop-filter: blur(20px);
  overflow: hidden;
  box-sizing: border-box;
}

.album-hero-static-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  filter: blur(32px) saturate(150%);
  opacity: 0.85;
  transition: opacity 300ms ease;
  pointer-events: none;
}

.album-hero-cover-wrapper,
.album-hero-info {
  position: relative;
  z-index: 1;
}

.album-hero-cover-wrapper {
  position: relative;
  flex: none;
  width: 168px;
  height: 168px;
  border-radius: 14px;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6);
  overflow: hidden;
}

.album-hero-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1);
}

.album-hero-cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--auralis-text) 8%, transparent);
}

.album-hero-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(12px);
  font-size: 11px;
  font-weight: 800;
  color: var(--auralis-text);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.album-hero-info {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.album-hero-title {
  margin: 0;
  max-width: 100%;
  font-size: 15px;
  font-weight: 800;
  color: var(--auralis-text);
  line-height: 1.35;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.album-hero-artist {
  margin: 0;
  max-width: 100%;
  font-size: 12px;
  font-weight: 600;
  color: var(--auralis-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.archive-album-magazine-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.archive-album-magazine-item {
  display: grid;
  min-width: 0;
  grid-template-columns: 36px 48px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: color-mix(in srgb, var(--auralis-text) 3%, transparent);
  transition: all 180ms ease;
  cursor: pointer;
}

/* Pin stats column: right-edge align across rows (count + duration) */
.archive-album-magazine-item .archive-ranking-meta {
  flex-shrink: 0;
  justify-self: end;
  font-variant-numeric: tabular-nums;
}

.archive-album-magazine-item .archive-ranking-meta strong {
  font-variant-numeric: tabular-nums;
}

.archive-album-magazine-item:hover,
.archive-album-magazine-item.is-selected {
  background: color-mix(in srgb, var(--auralis-text) 8%, transparent);
  border-color: color-mix(in srgb, var(--auralis-active-album-accent, #4f46e5) 30%, transparent);
  transform: translateX(4px);
}

.archive-album-magazine-item.is-selected {
  box-shadow: 0 4px 16px
    color-mix(in srgb, var(--auralis-active-album-accent, #4f46e5) 20%, transparent);
}
</style>
