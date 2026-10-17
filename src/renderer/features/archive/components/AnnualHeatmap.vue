<script setup lang="ts">
import { computed, onMounted, onScopeDispose, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { auralis } from '@renderer/shared/ipc/client'
import type { DailyPlayCount } from '@shared/types/listeningArchive'
import ArchiveDayBubble from './ArchiveDayBubble.vue'
import ArchiveDayPanel from './ArchiveDayPanel.vue'
import ArchiveYear from './ArchiveYear.vue'
import { useArchiveDayBubble } from '../composables/useArchiveDayBubble'
import { useArchivePanelMotion } from '../composables/useArchivePanelMotion'
import { createAnnualCalendar } from '../utils/annualCalendar'
import { playCountIntensity } from '../utils/playCountIntensity'

const props = defineProps<{ year: number; days: DailyPlayCount[]; pinnedDate?: string | null }>()
const emit = defineEmits<{ previousYear: []; nextYear: []; pinDate: [date: string] }>()
const { t, locale } = useI18n()
const calendar = computed(() => createAnnualCalendar(props.year))
const counts = computed(() => new Map(props.days.map((day) => [day.date, day.playCount])))
const totalPlays = computed(() => props.days.reduce((total, day) => total + day.playCount, 0))
const activeDays = computed(() => props.days.filter((day) => day.playCount > 0).length)
const dayStats = computed(() => new Map(props.days.map((day) => [day.date, day])))
const bubble = useArchiveDayBubble(auralis.archive)
const panelMotion = useArchivePanelMotion(bubble.close)
function openPanel(element: Element, done: () => void) {
  if (bubble.anchor.value) panelMotion.enter(element, bubble.anchor.value, done)
  else done()
}
const { date: bubbleDate, anchor: bubbleAnchor, expanded, tracks, loading, failed } = bubble
const bubbleId = useId()
const overlayId = computed(() =>
  expanded.value ? `${bubbleId}-panel-${bubbleDate.value}` : `${bubbleId}-preview`,
)
const root = ref<HTMLElement | null>(null)
const focusDate = ref(`${props.year}-01-01`)
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
  if (event.pointerType !== 'touch') bubble.preview(date, event.currentTarget as HTMLElement)
}
function focus(date: string, event: FocusEvent) {
  focusDate.value = date
  bubble.preview(date, event.currentTarget as HTMLElement, true)
}
function pin(date: string) {
  bubble.close()
  emit('pinDate', date)
}
function navigate(date: string, event: KeyboardEvent) {
  if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    event.preventDefault()
    emit('pinDate', date)
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
    document.getElementById(overlayId.value)?.contains(target)
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
    focusDate.value = `${props.year}-01-01`
    const scroll = root.value?.querySelector('.heatmap-scroll')
    if (scroll) scroll.scrollLeft = 0
  },
)
watch(
  () => props.days,
  () => {
    void bubble.refresh()
  },
)
onMounted(() => {
  document.addEventListener('pointerdown', onOutside)
  document.addEventListener('focusin', onOutside)
  document.addEventListener('keydown', onEscape)
})
onScopeDispose(() => {
  document.removeEventListener('pointerdown', onOutside)
  document.removeEventListener('focusin', onOutside)
  document.removeEventListener('keydown', onEscape)
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
  <div ref="root" class="annual-heatmap" :style="{ '--heatmap-weeks': calendar.weeks.length }">
    <div class="heatmap-header">
      <div class="archive-year-navigation">
        <button
          type="button"
          class="archive-year-chevron"
          :aria-label="t('archive.previousYear')"
          @click="emit('previousYear')"
        >
          <span class="i-lucide-chevron-left" aria-hidden="true"></span>
        </button>
        <ArchiveYear :year="year" />
        <button
          type="button"
          class="archive-year-chevron"
          :aria-label="t('archive.nextYear')"
          @click="emit('nextYear')"
        >
          <span class="i-lucide-chevron-right" aria-hidden="true"></span>
        </button>
      </div>
      <div class="heatmap-legend" aria-hidden="true">
        <span
          v-for="level in 5"
          :key="level"
          class="heatmap-cell"
          :class="`heatmap-cell--level-${level - 1}`"
        ></span>
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
                  { 'heatmap-cell--pinned': pinnedDate === date },
                ]"
                :data-date="date"
                :tabindex="focusDate === date ? 0 : -1"
                :aria-label="dateLabels.get(date)"
                :aria-current="pinnedDate === date ? 'date' : undefined"
                aria-haspopup="dialog"
                :aria-expanded="bubbleDate === date && expanded"
                :aria-controls="bubbleDate === date && expanded ? overlayId : undefined"
                :aria-describedby="bubbleDate === date && !expanded ? overlayId : undefined"
                @pointerenter="preview(date, $event)"
                @pointerleave="bubble.leave"
                @focus="focus(date, $event)"
                @blur="bubble.leave"
                @keydown="navigate(date, $event)"
                @click="bubble.select(date, $event.currentTarget as HTMLElement)"
                @contextmenu.prevent="pin(date)"
              ></button>
              <span v-else class="heatmap-cell heatmap-cell--padding" aria-hidden="true"></span>
            </template>
          </div>
        </div>
      </div>
    </div>
    <Teleport to="body">
      <ArchiveDayBubble
        v-if="bubbleDate && bubbleAnchor && !expanded"
        :id="overlayId"
        :date="bubbleDate"
        :anchor="bubbleAnchor"
        :play-count="summary?.playCount ?? 0"
        :duration-seconds="summary?.durationSeconds ?? 0"
        @keep="bubble.keepOpen"
        @leave="bubble.leave"
        @close="bubble.close"
      />
      <Transition
        :css="false"
        @before-enter="panelMotion.beforeEnter"
        @enter="openPanel"
        @leave="panelMotion.leave"
      >
        <ArchiveDayPanel
          v-if="bubbleDate && bubbleAnchor && expanded"
          :id="overlayId"
          :key="bubbleDate"
          :date="bubbleDate"
          :tracks="tracks"
          :loading="loading"
          :failed="failed"
        />
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.annual-heatmap {
  --heatmap-gap: 3px;
  /* Keep square days and a 12px minimum; reserve 40px for the weekday axis
     and 4px for the scroll container's inline padding. */
  --heatmap-cell-size: max(
    12px,
    calc((100cqw - 44px - (var(--heatmap-weeks) - 1) * var(--heatmap-gap)) / var(--heatmap-weeks))
  );
  --heatmap-empty: var(--auralis-surface-raised);
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
}

.heatmap-cell {
  display: block;
  width: var(--heatmap-cell-size);
  height: var(--heatmap-cell-size);
  border-radius: 2px;
  background: var(--heatmap-empty);
}

.heatmap-cell--padding {
  visibility: hidden;
}

.heatmap-cell--interactive {
  position: relative;
  padding: 0;
  border: 0;
  appearance: none;
  cursor: pointer;
}
.heatmap-cell--interactive:hover {
  z-index: 1;
  transform: scale(1.12);
}
.heatmap-cell--interactive:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 1px;
}

.heatmap-cell--pinned {
  z-index: 1;
  box-shadow: inset 0 0 0 2px var(--auralis-text);
}

.heatmap-cell--interactive[aria-expanded='true'] {
  opacity: 0;
}

.heatmap-cell--level-1 {
  background: color-mix(in srgb, var(--auralis-theme-accent) 25%, var(--heatmap-empty));
}

.heatmap-cell--level-2 {
  background: color-mix(in srgb, var(--auralis-theme-accent) 45%, var(--heatmap-empty));
}

.heatmap-cell--level-3 {
  background: color-mix(in srgb, var(--auralis-theme-accent) 70%, var(--heatmap-empty));
}

.heatmap-cell--level-4 {
  background: var(--auralis-theme-accent);
}

.heatmap-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-inline: 2px;
  margin-bottom: 12px;
}

.archive-year-navigation {
  display: flex;
  align-items: center;
  gap: 4px;
}

.archive-year-chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 28px;
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

.archive-year-chevron:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 2px;
}

.heatmap-legend {
  --heatmap-cell-size: 12px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: var(--heatmap-gap);
}
</style>
