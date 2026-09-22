<script setup lang="ts">
import { onBeforeUnmount, onMounted, toRef } from 'vue'
import { auralis } from '@renderer/shared/ipc/client'
import RankingRecordShelf from './RankingRecordShelf.vue'
import RankingTrackRibbons from './RankingTrackRibbons.vue'
import { useArchiveRanking } from '../composables/useArchiveRanking'

const props = defineProps<{ year: number; visible: boolean }>()
const currentYear = new Date().getFullYear()
const selectedYear = toRef(props, 'year')
const {
  listeningRanking,
  rankingRange,
  rankingTarget,
  rankingMonth,
  rankingYear,
  rankingPickerYear,
  rankingPickerMonth,
  isRankingLoading,
  rankingError,
  showRankingPicker,
  pickerPos,
  rankingRanges,
  rankingTargets,
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
} = useArchiveRanking(selectedYear, {
  getListeningRanking: (params) => auralis.archive.getListeningRanking(params),
})
function handleDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Element)) return
  if (!target.closest('[data-ranking-period-control]')) {
    showRankingPicker.value = false
  }
}
onMounted(() => document.addEventListener('pointerdown', handleDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', handleDocumentPointerDown))
defineExpose({ refresh: loadListeningRanking })
</script>

<template>
  <section v-if="visible" class="archive-ranking">
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
    <RankingRecordShelf
      v-else-if="rankingTarget === 'album'"
      :key="rankingTarget"
      :items="listeningRanking.items"
      :target="rankingTarget"
    />
    <RankingTrackRibbons v-else :items="listeningRanking.items" />
  </section>
  <Teleport to="body">
    <div class="archive-overlay">
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
    </div>
  </Teleport>
</template>

<style scoped src="../styles/archive.ranking.css"></style>
