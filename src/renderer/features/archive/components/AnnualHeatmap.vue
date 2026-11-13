<script setup lang="ts">
import {
  computed,
  nextTick,
  onDeactivated,
  onMounted,
  onScopeDispose,
  ref,
  useId,
  watch,
} from 'vue'
import { useI18n } from 'vue-i18n'
import type { DailyPlayCount } from '@shared/types/listeningArchive'
import ArchiveDayBubble from './ArchiveDayBubble.vue'
import ArchiveYear from './ArchiveYear.vue'
import { useArchiveDayBubble } from '../composables/useArchiveDayBubble'
import { createAnnualCalendar } from '../utils/annualCalendar'
import { playCountIntensity } from '../utils/playCountIntensity'
import { createHeatmapRipple } from '../runtime/heatmapRipple'

const props = defineProps<{ year: number; days: DailyPlayCount[]; pinnedDate?: string | null }>()
const emit = defineEmits<{ previousYear: []; nextYear: []; pinDate: [date: string] }>()
const { t, locale } = useI18n()
const calendar = computed(() => createAnnualCalendar(props.year))
const counts = computed(() => new Map(props.days.map((day) => [day.date, day.playCount])))
const totalPlays = computed(() => props.days.reduce((total, day) => total + day.playCount, 0))
const activeDays = computed(() => props.days.filter((day) => day.playCount > 0).length)
const dayStats = computed(() => new Map(props.days.map((day) => [day.date, day])))
const bubble = useArchiveDayBubble()
const { date: bubbleDate, anchor: bubbleAnchor } = bubble
const overlayId = useId()
const root = ref<HTMLElement | null>(null)
const focusDate = ref(props.pinnedDate ?? `${props.year}-01-01`)
let ripple: ReturnType<typeof createHeatmapRipple> | undefined
const summary = computed(() => dayStats.value.get(bubbleDate.value ?? ''))
const dateFormatter = computed(
  () =>
    new Intl.DateTimeFormat(locale.value, {
      month: 'long',
      day: 'numeric',
      weekday: 'short',
      timeZone: 'UTC',
    }),
)
const dateLabels = computed(() => {
  const labels = new Map<string, string>()
  for (const date of calendar.value.weeks.flat()) {
    if (!date) continue
    const stats = dayStats.value.get(date)
    labels.set(
      date,
      `${dateFormatter.value.format(new Date(`${date}T00:00:00Z`))}, ${t('archive.daySummary', { count: stats?.playCount ?? 0, minutes: Math.round((stats?.durationSeconds ?? 0) / 60) })}`,
    )
  }
  return labels
})
function preview(date: string, event: PointerEvent) {
  if (event.pointerType === 'touch') return
  const cell = event.currentTarget as HTMLElement
  bubble.preview(date, cell)
  ripple?.trigger(cell)
}
function focus(date: string, event: FocusEvent) {
  focusDate.value = date
  bubble.preview(date, event.currentTarget as HTMLElement, true)
}
function pin(date: string) {
  bubble.close()
  focusDate.value = date
  emit('pinDate', date)
}
function navigate(date: string, event: KeyboardEvent) {
  if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    event.preventDefault()
    pin(date)
    return
  }
  const dates = calendar.value.weeks.flat()
  const index = dates.indexOf(date)
  const row = index % 7
  const steps: Record<string, number> = {
    ArrowLeft: -7,
    ArrowRight: 7,
    ArrowUp: row > 0 ? -1 : 0,
    ArrowDown: row < 6 ? 1 : 0,
  }
  const step = steps[event.key]
  const next =
    event.key === 'Home'
      ? dates.find(Boolean)
      : event.key === 'End'
        ? [...dates].reverse().find(Boolean)
        : step
          ? dates[index + step]
          : null
  if (!next) return
  event.preventDefault()
  focusDate.value = next
  root.value?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus()
}
function onOutside(event: Event) {
  const target = event.target
  const cell = target instanceof Element ? target.closest('[data-date]') : null
  if (
    !(target instanceof Node) ||
    (cell && root.value?.contains(cell)) ||
    document.getElementById(overlayId)?.contains(target)
  )
    return
  bubble.close()
}
function onEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !bubbleDate.value) return
  bubble.close()
  event.stopPropagation()
}
watch(
  () => props.year,
  () => {
    bubble.close()
    ripple?.reset()
    void nextTick(() => ripple?.refresh())
    focusDate.value = props.pinnedDate ?? `${props.year}-01-01`
    const scroll = root.value?.querySelector('.heatmap-scroll')
    if (scroll) scroll.scrollLeft = 0
  },
)
watch(
  () => props.pinnedDate,
  (date) => {
    if (date) focusDate.value = date
  },
)
function visibilityChanged() {
  bubble.close()
  if (document.hidden) {
    ripple?.reset()
  }
}
onMounted(() => {
  if (root.value) ripple = createHeatmapRipple(root.value)
  document.addEventListener('pointerdown', onOutside)
  document.addEventListener('focusin', onOutside)
  document.addEventListener('keydown', onEscape)
  document.addEventListener('visibilitychange', visibilityChanged)
})
onDeactivated(() => {
  bubble.close()
  ripple?.reset()
})
onScopeDispose(() => {
  ripple?.dispose()
  ripple = undefined
  document.removeEventListener('pointerdown', onOutside)
  document.removeEventListener('focusin', onOutside)
  document.removeEventListener('keydown', onEscape)
  document.removeEventListener('visibilitychange', visibilityChanged)
})
const monthLabels = computed(() => {
  const formatter = new Intl.DateTimeFormat(locale.value, { month: 'short', timeZone: 'UTC' })
  return calendar.value.months.map(({ month, column }) => ({
    column,
    label: formatter.format(new Date(Date.UTC(2000, month, 1))),
  }))
})
const weekdayLabels = computed(() => {
  const formatter = new Intl.DateTimeFormat(locale.value, { weekday: 'short', timeZone: 'UTC' })
  const firstDateRow = calendar.value.weeks[0].findIndex((date) => date !== null)
  return Array.from({ length: 7 }, (_, row) => ({
    row,
    label: formatter.format(new Date(Date.UTC(props.year, 0, 1 - firstDateRow + row))),
  }))
})
</script>

<template>
  <div
    ref="root"
    class="annual-heatmap"
    :class="{ 'is-previewing': bubbleDate }"
    :style="{ '--heatmap-weeks': calendar.weeks.length }"
  >
    <div class="heatmap-header">
      <div class="archive-year-navigation">
        <button
          type="button"
          class="archive-year-chevron"
          :disabled="year <= 1900"
          :aria-label="t('archive.previousYear')"
          @click="emit('previousYear')"
        >
          <span class="i-lucide-chevron-left" aria-hidden="true"></span>
        </button>
        <ArchiveYear :year="year" />
        <button
          type="button"
          class="archive-year-chevron"
          :disabled="year >= 9999"
          :aria-label="t('archive.nextYear')"
          @click="emit('nextYear')"
        >
          <span class="i-lucide-chevron-right" aria-hidden="true"></span>
        </button>
      </div>
    </div>
    <div
      class="heatmap-scroll"
      role="group"
      :aria-label="t('archive.calendarDescription', { year, plays: totalPlays, days: activeDays })"
    >
      <div class="heatmap-calendar">
        <div class="heatmap-months auralis-type-caption" aria-hidden="true">
          <span
            v-for="month in monthLabels"
            :key="month.column"
            :style="{ gridColumn: month.column + 1 }"
            >{{ month.label }}</span
          >
        </div>
        <div class="heatmap-weekdays auralis-type-caption" aria-hidden="true">
          <span
            v-for="weekday in weekdayLabels"
            :key="weekday.row"
            :style="{ gridRow: weekday.row + 1 }"
            >{{ weekday.label }}</span
          >
        </div>
        <div class="heatmap-weeks">
          <div v-for="(week, column) in calendar.weeks" :key="column" class="heatmap-week">
            <template v-for="(date, row) in week" :key="row">
              <button
                v-if="date"
                type="button"
                class="heatmap-cell heatmap-cell--interactive"
                :class="[
                  `heatmap-cell--level-${playCountIntensity(counts.get(date) ?? 0)}`,
                  {
                    'heatmap-cell--pinned': pinnedDate === date,
                  },
                ]"
                :data-date="date"
                :tabindex="focusDate === date ? 0 : -1"
                :aria-label="dateLabels.get(date)"
                :aria-pressed="pinnedDate === date"
                :aria-describedby="bubbleDate === date ? overlayId : undefined"
                @pointerenter="preview(date, $event)"
                @pointerleave="bubble.leave"
                @focus="focus(date, $event)"
                @blur="bubble.leave"
                @keydown="navigate(date, $event)"
                @click="pin(date)"
                @contextmenu.prevent="pin(date)"
              ><span class="heatmap-dot" aria-hidden="true"></span></button>
              <span v-else class="heatmap-cell heatmap-cell--padding" aria-hidden="true"></span>
            </template>
          </div>
        </div>
      </div>
    </div>
    <div class="heatmap-footer auralis-type-caption">
      <div class="heatmap-footer-summary">
        <div class="heatmap-year-stats">
          <span
            ><strong>{{ totalPlays.toLocaleString(locale) }}</strong>
            {{ t('archive.playsLabel') }}</span
          >
          <span
            ><strong>{{ activeDays.toLocaleString(locale) }}</strong>
            {{ t('archive.activeDaysLabel') }}</span
          >
        </div>
      </div>
      <div class="heatmap-legend" :aria-label="t('archive.intensityLegend')">
        <span>{{ t('archive.less') }}</span>
        <span
          v-for="level in 5"
          :key="level"
          class="heatmap-cell"
          :class="`heatmap-cell--level-${level - 1}`"
          aria-hidden="true"
        ></span>
        <span>{{ t('archive.more') }}</span>
      </div>
    </div>
    <Teleport to="body">
      <ArchiveDayBubble
        v-if="bubbleDate && bubbleAnchor"
        :id="overlayId"
        :date="bubbleDate"
        :anchor="bubbleAnchor"
        :play-count="summary?.playCount ?? 0"
        :duration-seconds="summary?.durationSeconds ?? 0"
        @keep="bubble.keepOpen"
        @leave="bubble.leave"
        @close="bubble.close"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.annual-heatmap {
  --heatmap-gap: 3px;
  /* Keep equal date targets and a 12px minimum; reserve 40px for the weekday axis
     and 4px for the scroll container's inline padding. */
  --heatmap-cell-size: max(
    12px,
    calc((100cqw - 44px - (var(--heatmap-weeks) - 1) * var(--heatmap-gap)) / var(--heatmap-weeks))
  );
  --heatmap-reveal-duration: 200ms;
  container-type: inline-size;
  min-width: 0;
  color: var(--auralis-text-muted);
}

.heatmap-scroll {
  max-width: 100%;
  overflow-x: auto;
  padding: 2px 2px 8px;
}

.heatmap-scroll:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 2px;
}

.heatmap-calendar {
  display: grid;
  grid-template-columns: 32px max-content;
  grid-template-rows: 18px max-content;
  gap: 8px;
  width: max-content;
}

.heatmap-months,
.heatmap-weeks {
  display: grid;
  grid-template-columns: repeat(var(--heatmap-weeks), var(--heatmap-cell-size));
  column-gap: var(--heatmap-gap);
}

.heatmap-months {
  grid-column: 2;
}

.heatmap-months > span {
  color: var(--auralis-text-muted);
  font-weight: 500;
  white-space: nowrap;
}

.heatmap-weekdays,
.heatmap-week {
  display: grid;
  grid-template-rows: repeat(7, var(--heatmap-cell-size));
  row-gap: var(--heatmap-gap);
}

.heatmap-weekdays {
  grid-column: 1;
  grid-row: 2;
}

.heatmap-weekdays > span {
  align-self: center;
  white-space: nowrap;
}

.heatmap-weeks {
  grid-column: 2;
  grid-row: 2;
  opacity: 0.5;
  transition: opacity var(--heatmap-reveal-duration) ease-out;
}

/* Keep labels in flow so revealing details never shifts the calendar or albums below it. */
.heatmap-months,
.heatmap-weekdays,
.heatmap-footer {
  opacity: 0;
  transition: opacity var(--heatmap-reveal-duration) ease-out;
}

.annual-heatmap:is(:hover, :focus-within, .is-previewing, [data-rippling])
  :is(.heatmap-months, .heatmap-weekdays, .heatmap-footer, .heatmap-weeks) {
  opacity: 1;
}

.heatmap-cell {
  --heatmap-dot-scale: 0.4;
  --heatmap-dot-color: color-mix(in srgb, var(--auralis-text) 20%, transparent);
  --heatmap-dot-size: clamp(4px, calc(var(--heatmap-cell-size) * var(--heatmap-dot-scale)), 12px);
  position: relative;
  display: grid;
  place-items: center;
  width: var(--heatmap-cell-size);
  height: var(--heatmap-cell-size);
  border-radius: 50%;
  background: transparent;
}

/* Only the dot changes size; every date retains the same pointer target. */
.heatmap-cell:not(.heatmap-cell--interactive)::before,
.heatmap-dot {
  width: var(--heatmap-dot-size);
  height: var(--heatmap-dot-size);
  border-radius: 50%;
  background: var(--heatmap-dot-color);
  pointer-events: none;
}

/* Keep the hover halo outside the element whose transform is animated. */
.heatmap-cell--interactive::before {
  position: absolute;
  width: calc(var(--heatmap-dot-size) + 4px);
  height: calc(var(--heatmap-dot-size) + 4px);
  box-sizing: border-box;
  border: 2px solid color-mix(in srgb, var(--auralis-text) 16%, transparent);
  border-radius: 50%;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--heatmap-reveal-duration) ease-out;
  content: '';
}

.heatmap-cell:not(.heatmap-cell--interactive)::before {
  content: '';
}

.heatmap-cell--padding {
  visibility: hidden;
}

.heatmap-cell--interactive {
  padding: 0;
  border: 0;
  appearance: none;
  cursor: pointer;
}
.heatmap-cell--interactive:hover::before {
  opacity: 1;
}
.heatmap-cell--interactive:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 1px;
}

.heatmap-cell--pinned::after {
  position: absolute;
  top: 50%;
  left: 50%;
  width: calc(var(--heatmap-dot-size) + 6px);
  height: calc(var(--heatmap-dot-size) + 6px);
  border: 1px solid var(--auralis-text);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  content: '';
}

.heatmap-cell--level-1 {
  --heatmap-dot-scale: 0.5;
  --heatmap-dot-color: color-mix(in srgb, var(--auralis-text) 35%, transparent);
}

.heatmap-cell--level-2 {
  --heatmap-dot-scale: 0.6;
  --heatmap-dot-color: color-mix(in srgb, var(--auralis-text) 50%, transparent);
}

.heatmap-cell--level-3 {
  --heatmap-dot-scale: 0.72;
  --heatmap-dot-color: color-mix(in srgb, var(--auralis-text) 70%, transparent);
}

.heatmap-cell--level-4 {
  --heatmap-dot-scale: 0.85;
  --heatmap-dot-color: color-mix(in srgb, var(--auralis-text) 90%, transparent);
}

.heatmap-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-inline: 2px;
  margin-bottom: 20px;
}

.archive-year-navigation {
  display: flex;
  align-items: center;
  gap: 10px;
}

.archive-year-chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 32px;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--auralis-text-muted);
  cursor: pointer;
}

.archive-year-chevron > span {
  width: 16px;
  height: 16px;
}

.archive-year-chevron:hover {
  background: var(--auralis-surface-raised);
  color: var(--auralis-text);
}
.archive-year-chevron:disabled {
  opacity: 0.3;
  cursor: default;
  background: transparent;
}
.heatmap-year-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  color: var(--auralis-text-muted);
}
.heatmap-year-stats strong {
  margin-right: 3px;
  color: var(--auralis-text);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.heatmap-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 16px;
  margin: 10px 2px 0;
  color: var(--auralis-text-faint);
}
.heatmap-footer-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}
.archive-year-chevron:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 2px;
}

.heatmap-legend {
  --heatmap-cell-size: 12px;
  margin-left: auto;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: var(--heatmap-gap);
}
.heatmap-legend > span:first-child {
  margin-right: 4px;
}
.heatmap-legend > span:last-child {
  margin-left: 4px;
}
/* Touch has no hover state; all explanatory information stays visible. */
@media (hover: none) {
  .heatmap-months,
  .heatmap-weekdays,
  .heatmap-footer,
  .heatmap-weeks {
    opacity: 1;
  }
}

:where([data-reduced-motion='true']) .annual-heatmap {
  --heatmap-reveal-duration: 0ms;
}

@media (prefers-reduced-motion: reduce) {
  .annual-heatmap {
    --heatmap-reveal-duration: 0ms;
  }
}
</style>
