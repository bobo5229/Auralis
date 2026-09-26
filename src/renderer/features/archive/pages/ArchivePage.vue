<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { auralis } from '@renderer/shared/ipc/client'
import ArchiveDailyDetailDialog from '../components/ArchiveDailyDetailDialog.vue'
import ArchiveAnnualRecapDialog from '../components/ArchiveAnnualRecapDialog.vue'
import ArchiveRankingSection from '../components/ArchiveRankingSection.vue'
import ArchiveResetDialog from '../components/ArchiveResetDialog.vue'
import { useArchiveCalendar, type CalendarDay } from '../composables/useArchiveCalendar'
import { useArchiveDailyDetail } from '../composables/useArchiveDailyDetail'
import { formatArchiveMinutes as formatMinutes } from '../utils/archiveDailyDetailState'

const currentYear = new Date().getFullYear()
const selectedYear = ref(currentYear)
const {
  heatmap,
  isLoading,
  errorMessage,
  weekdayOrder,
  calendarDays,
  monthMarkers,
  peakDay,
  linerNotesData,
  loadHeatmap: loadCalendar,
} = useArchiveCalendar(selectedYear)
const {
  dailyDetail,
  isDetailLoading,
  detailError,
  detailDialog,
  openDailyDetail: openDetail,
  closeDailyDetail,
  clearDailyDetail,
} = useArchiveDailyDetail((date) => auralis.archive.getDailyListeningDetail(date))
const rankingSection = ref<InstanceType<typeof ArchiveRankingSection> | null>(null)
const annualRecap = ref<InstanceType<typeof ArchiveAnnualRecapDialog> | null>(null)
const resetDialog = ref<InstanceType<typeof ArchiveResetDialog> | null>(null)
let unsubscribeLibraryChanged: (() => void) | null = null

function loadHeatmap(): Promise<void> {
  return loadCalendar()
}
function calendarTooltip(day: CalendarDay): string {
  const countLabel = day.isFuture ? '未来日期' : `播放了 ${formatMinutes(day.durationSeconds)}`
  return `${day.label} · ${countLabel}`
}

function openDailyDetail(event: MouseEvent | KeyboardEvent, day: CalendarDay): Promise<void> {
  return openDetail(event, day)
}
function handleLinerNotesPeakClick(event: MouseEvent | KeyboardEvent): void {
  if (peakDay.value) void openDailyDetail(event, peakDay.value)
}
async function handleResetComplete(): Promise<void> {
  clearDailyDetail()
  selectedYear.value = currentYear
  annualRecap.value?.clearRankings()
  await loadHeatmap()
  await rankingSection.value?.refresh()
  await annualRecap.value?.refreshIfOpen()
}
onMounted(() => {
  void loadHeatmap()
  void rankingSection.value?.refresh()
  unsubscribeLibraryChanged = auralis.library.onChanged((event) => {
    if (event.reason !== 'play-stats-updated' && event.reason !== 'play-stats-reset') return
    void loadHeatmap()
    void rankingSection.value?.refresh()
    void annualRecap.value?.refreshIfOpen()
  })
})
onBeforeUnmount(() => unsubscribeLibraryChanged?.())
</script>

<template>
  <section class="archive-page content-frame">
    <div class="archive-heatmap-card">
      <div class="archive-card-heading">
        <div>
          <span class="archive-section-kicker">Calendar</span>
          <h2>音乐日历</h2>
          <button
            v-if="!isLoading && !errorMessage"
            type="button"
            class="archive-recap-entry"
            @click="annualRecap?.open()"
          >
            年度总结
          </button>
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
              v-tooltip.data="calendarTooltip(day)"
              type="button"
              class="archive-day"
              :class="[`heat-level-${day.level}`, { 'archive-day--future': day.isFuture }]"
              :aria-label="`${day.label}，${day.isFuture ? '未来日期' : `播放了${formatMinutes(day.durationSeconds)}`}`"
              @click="openDailyDetail($event, day)"
            ></button>
          </div>
        </div>
      </div>
    </div>
    <ArchiveRankingSection ref="rankingSection" :year="selectedYear" :visible="heatmap !== null" />
    <Teleport to="body">
      <div class="archive-overlay">
        <ArchiveDailyDetailDialog
          v-if="detailDialog"
          :dialog="detailDialog"
          :detail="dailyDetail"
          :loading="isDetailLoading"
          :error="detailError"
          @close="closeDailyDetail"
        />
        <ArchiveAnnualRecapDialog
          ref="annualRecap"
          :year="selectedYear"
          :calendar-days="calendarDays"
          :peak-day="peakDay"
          :liner-notes-data="linerNotesData"
          @click-peak="handleLinerNotesPeakClick"
          @reset="resetDialog?.open()"
        />
        <ArchiveResetDialog ref="resetDialog" :after-reset="handleResetComplete" />
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.archive-page {
  --auralis-archive-accent: var(--auralis-sidebar-active-indicator);
  --archive-panel-bg: color-mix(in srgb, var(--auralis-sidebar-bg) 65%, transparent);
  --archive-panel-border: color-mix(in srgb, var(--auralis-text) 8%, transparent);
  --archive-panel-shadow: 0 16px 36px color-mix(in srgb, var(--auralis-text) 5%, transparent);
  --archive-accent-soft: color-mix(
    in srgb,
    var(--auralis-sidebar-active-indicator) 12%,
    transparent
  );
  height: 100%;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: none;
  padding-bottom: calc(var(--auralis-playbar-safe-area) + 40px);
}

.archive-page::-webkit-scrollbar {
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
.archive-section-heading {
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
.archive-heatmap-card {
  padding: 0;
}

.archive-card-heading h2,
.archive-section-heading h2 {
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
  padding: 6px 0;
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
  container-type: inline-size;
}

.archive-recap-entry {
  margin-top: 12px;
  padding: 6px 12px;
  border: none;
  border-radius: 8px;
  background: var(--auralis-control-hover-bg);
  color: var(--auralis-text);
  cursor: pointer;
}

.archive-recap-entry:hover {
  background: var(--auralis-control-active-bg);
}

.archive-recap-entry:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 3px;
}

@media (max-width: 900px) {
  .archive-card-heading,
  .archive-section-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .archive-summary-grid {
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
  .archive-summary-grid {
    grid-template-columns: 1fr;
  }

  .archive-summary-expanded {
    display: none;
  }

  .archive-summary-item:hover > .archive-summary-label,
  .archive-summary-item:hover > .archive-summary-value {
    display: none;
  }
}
</style>
