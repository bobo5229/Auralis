<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRef } from 'vue'
import type { ListeningRanking } from '@shared/types/archive'
import { auralis } from '@renderer/shared/ipc/client'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import EditorialLinerNotesCard from './EditorialLinerNotesCard.vue'
import type { EditorialLinerNotesData } from '../utils/editorialLinerNotes'
import type { CalendarDay } from '../composables/useArchiveCalendar'
import { formatArchiveMinutes as formatMinutes } from '../utils/archiveDailyDetailState'

const props = defineProps<{
  year: number
  calendarDays: CalendarDay[]
  peakDay: CalendarDay | null
  linerNotesData: EditorialLinerNotesData
}>()
const emit = defineEmits<{
  'click-peak': [event: MouseEvent | KeyboardEvent]
  reset: []
}>()
const selectedYear = toRef(props, 'year')
const calendarDays = toRef(props, 'calendarDays')
const peakDay = toRef(props, 'peakDay')
const showAnnualRecap = ref(false)
const isAnnualRecapLoading = ref(false)
const annualRecapError = ref<string | null>(null)
const annualRecapTrackRanking = ref<ListeningRanking | null>(null)
const annualRecapAlbumRanking = ref<ListeningRanking | null>(null)
const annualRecapPage = ref(0)
let annualRecapRequestId = 0
const annualRecapWeekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const ANNUAL_RECAP_PAGE_COUNT = 5
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
function handleLinerNotesPeakClick(event: MouseEvent | KeyboardEvent): void {
  if (!peakDay.value) return
  closeAnnualRecap()
  emit('click-peak', event)
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
async function refreshIfOpen(): Promise<void> {
  if (showAnnualRecap.value) await loadAnnualRecapRankings()
}
onMounted(() => document.addEventListener('keydown', handleDocumentKeyDown))
onBeforeUnmount(() => {
  ++annualRecapRequestId
  document.removeEventListener('keydown', handleDocumentKeyDown)
})
defineExpose({ open: openAnnualRecap, refreshIfOpen, clearRankings: clearAnnualRecapRankings })
</script>

<template>
  <div v-if="showAnnualRecap" class="archive-annual-recap-backdrop" @click.self="closeAnnualRecap">
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
        </div>
        <button type="button" aria-label="关闭年度总结" @click="closeAnnualRecap">
          <span class="i-lucide-x h-4 w-4"></span>
        </button>
      </header>

      <div class="archive-annual-recap-content">
        <Transition name="archive-annual-recap-page" mode="out-in">
          <section v-if="annualRecapPage === 0" key="cover" class="archive-annual-recap-ticket">
            <EditorialLinerNotesCard
              :data="linerNotesData"
              @click-peak="handleLinerNotesPeakClick"
              @reset="emit('reset')"
            />
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

          <section v-else-if="annualRecapPage === 2" key="tracks" class="archive-annual-recap-page">
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
                    loading="lazy"
                    decoding="async"
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

          <section v-else-if="annualRecapPage === 3" key="albums" class="archive-annual-recap-page">
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
                    loading="lazy"
                    decoding="async"
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
</template>

<style scoped src="../styles/archive.annual-recap.css"></style>
