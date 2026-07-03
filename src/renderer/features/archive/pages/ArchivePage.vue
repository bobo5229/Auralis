<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { auralis } from '@renderer/shared/ipc/client'
import type { ListeningHeatmap } from '@shared/types/archive'

interface CalendarDay {
  date: string
  label: string
  playCount: number
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
const isLoading = ref(true)
const errorMessage = ref<string | null>(null)
const tooltip = ref<HeatmapTooltip | null>(null)

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

const weekdayOrder = computed(() => {
  const firstWeekday = new Date(selectedYear.value, 0, 1).getDay()
  return Array.from({ length: 7 }, (_, index) => weekdayNames[(firstWeekday + index) % 7])
})

const calendarDays = computed<CalendarDay[]>(() => {
  const countByDate = new Map(
    (heatmap.value?.days ?? []).map((day) => [day.date, day.playCount] as const),
  )
  const todayKey = formatDateKey(new Date())
  const daysInYear = new Date(selectedYear.value, 1, 29).getMonth() === 1 ? 366 : 365

  return Array.from({ length: daysInYear }, (_, index) => {
    const date = new Date(selectedYear.value, 0, index + 1)
    const dateKey = formatDateKey(date)
    const playCount = countByDate.get(dateKey) ?? 0

    return {
      date: dateKey,
      label: `${date.getMonth() + 1}月${date.getDate()}日`,
      playCount,
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
const annualSummary = computed(() => {
  const elapsedDays = calendarDays.value.filter((day) => !day.isFuture)
  const listeningDays = elapsedDays.filter((day) => day.playCount > 0).length
  const totalPlays = elapsedDays.reduce((total, day) => total + day.playCount, 0)
  let longestStreak = 0
  let currentStreak = 0

  for (const day of elapsedDays) {
    if (day.playCount > 0) {
      currentStreak += 1
      longestStreak = Math.max(longestStreak, currentStreak)
    } else {
      currentStreak = 0
    }
  }

  const peakDay = elapsedDays.reduce<CalendarDay | null>((peak, day) => {
    if (day.playCount <= 0) return peak
    if (!peak || day.playCount > peak.playCount) return day
    return peak
  }, null)

  return [
    { label: '听歌天数', value: `${listeningDays}`, unit: '天' },
    { label: '播放次数', value: `${totalPlays}`, unit: '次' },
    { label: '最长连续聆听', value: `${longestStreak}`, unit: '天' },
    {
      label: '最活跃的一天',
      value: peakDay?.label ?? '暂无记录',
      unit: peakDay ? `${peakDay.playCount} 次` : '',
    },
  ]
})

async function loadHeatmap(): Promise<void> {
  isLoading.value = true
  errorMessage.value = null
  tooltip.value = null

  try {
    heatmap.value = await auralis.archive.getListeningHeatmap(selectedYear.value)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '无法读取听歌记录'
  } finally {
    isLoading.value = false
  }
}

async function changeYear(offset: -1 | 1): Promise<void> {
  const nextYear = selectedYear.value + offset
  if (nextYear < firstAvailableYear.value || nextYear > currentYear) return

  selectedYear.value = nextYear
  await loadHeatmap()
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
  const countLabel = day.isFuture ? '未来日期' : `${day.playCount} 次播放`
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

onMounted(loadHeatmap)
</script>

<template>
  <section class="archive-page content-frame">
    <div class="archive-heading">
      <div>
        <h1>Archive</h1>
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
              :aria-label="`${day.label}，${day.isFuture ? '未来日期' : `${day.playCount}次播放`}`"
              @mouseenter="showTooltip($event, day)"
              @mousemove="updateTooltipPosition"
              @mouseleave="hideTooltip"
              @focus="showTooltip($event, day)"
              @blur="hideTooltip"
            ></button>
          </div>
        </div>
      </div>
    </div>

    <section v-if="!isLoading && !errorMessage" class="archive-summary">
      <h2>年度摘要</h2>
      <div class="archive-summary-grid">
        <div v-for="item in annualSummary" :key="item.label" class="archive-summary-item">
          <span class="archive-summary-label">{{ item.label }}</span>
          <div class="archive-summary-value">
            <strong>{{ item.value }}</strong>
            <span v-if="item.unit">{{ item.unit }}</span>
          </div>
        </div>
      </div>
    </section>

    <Teleport to="body">
      <div
        v-if="tooltip"
        class="archive-tooltip"
        :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
      >
        {{ tooltip.text }}
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.archive-page {
  min-height: 100%;
  padding-bottom: var(--auralis-playbar-safe-area);
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
  min-width: 0;
  padding: 22px 20px;
}

.archive-summary-item + .archive-summary-item {
  border-left: 1px solid var(--auralis-border-subtle);
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
}
</style>
