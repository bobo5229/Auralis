<script setup lang="ts">
import {
  computed,
  nextTick,
  onActivated,
  onDeactivated,
  onMounted,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { TrackListItem } from '@shared/types/libraryScan'
import { resolveAlbumArtist, resolveAlbumTitle } from '@shared/utils/albumIdentity'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import MainPageStatus from '@renderer/shared/components/MainPageStatus.vue'
import SettingsSelect from '@renderer/shared/components/SettingsSelect.vue'
import SettingsSegmentedControl from '@renderer/features/settings/components/SettingsSegmentedControl.vue'
import { useSettingsDialog } from '@renderer/features/settings/composables/useSettingsDialog'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import type { AlbumSummary } from '@shared/types/albumSummary'
import { getAlbumCatalogIndex } from '@renderer/shared/catalog/albumCatalogIndex'
import { buildAlbumPlaybackQueue } from '@renderer/shared/catalog/albumPlaybackQueue'
import { filterJournalDays, type JournalFilter } from '../utils/recentAddedJournal'
import {
  parseRecentAddedLibraryRange,
  RECENT_ADDED_LIBRARY_RANGES,
} from '../utils/recentAddedLibrary'
import { libraryCatalogClient } from '../utils/libraryCatalogClient'
import { useRecentJournalCatalog } from '../composables/useRecentJournalCatalog'
import { useRecentAddedJournal } from '../composables/useRecentAddedJournal'
import RecentJournalDay from '../components/RecentJournalDay.vue'

defineOptions({ name: 'RecentAddedPage' })
const props = withDefaults(defineProps<{ isTransitioning?: boolean }>(), { isTransitioning: false })
const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const playback = usePlayback()
const { openSettings } = useSettingsDialog()
const mountedActive = ref(true)
const active = computed(
  () => mountedActive.value && route.name === 'recent-added' && !props.isTransitioning,
)
onActivated(() => {
  mountedActive.value = true
})
onDeactivated(() => {
  mountedActive.value = false
})
const { tracks, loaded, isLoading, error, refresh } = useRecentJournalCatalog(
  active,
  auralis.library,
  libraryCatalogClient,
  (cause) =>
    rendererDiagnostics.error({
      scope: 'recent-added.catalog',
      message: 'Failed to load collection journal',
      cause,
    }),
)
const range = computed(() => parseRecentAddedLibraryRange(route.query.range) ?? 'all')
const filter = ref<JournalFilter>('all')
const filters = computed(() => [
  { value: 'all', label: t('library.journal.all') },
  { value: 'albums', label: t('library.journal.albums') },
  { value: 'tracks', label: t('library.journal.tracks') },
])
const ranges = computed(() => {
  const values: (number | 'all')[] = [...RECENT_ADDED_LIBRARY_RANGES]
  if (!values.includes(range.value)) values.push(range.value)
  return values.map((value) => ({
    value: String(value),
    label:
      value === 'all'
        ? t('sidebar.recentAddedRangeAll')
        : t('library.recentAdded.days', { count: value }),
  }))
})
const now = ref(Date.now())
function syncClock(): void {
  if (active.value && document.visibilityState === 'visible') now.value = Date.now()
}
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(syncClock, 60_000)
  document.addEventListener('visibilitychange', syncClock)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  document.removeEventListener('visibilitychange', syncClock)
})
watch(active, (value) => {
  if (value) syncClock()
})
const {
  journal,
  loaded: journalLoaded,
  isBuilding,
  error: journalError,
} = useRecentAddedJournal(
  tracks,
  range,
  now,
  computed(() => active.value && loaded.value),
  (cause) =>
    rendererDiagnostics.error({
      scope: 'recent-added.journal',
      message: 'Failed to build collection journal',
      cause,
    }),
)
const pageLoaded = computed(() => loaded.value && journalLoaded.value)
const pageError = computed(() => error.value ?? journalError.value)
const isRefreshing = computed(() => isLoading.value || isBuilding.value)
const days = computed(() => filterJournalDays(journal.value, filter.value))
// Bound mounted days as well as each day's entries; date jumps skip intervening content.
const pageStart = ref(0)
const visibleDays = computed(() => days.value.slice(pageStart.value, pageStart.value + 7))
watch(
  () => days.value.length,
  (length) => {
    if (pageStart.value >= length) pageStart.value = 0
  },
)
const scroller = ref<HTMLElement | null>(null)
const activeDay = ref('')
const actionError = ref(false)
let viewRevision = 0
const catalog = computed(() => getAlbumCatalogIndex(tracks.value))
const months = computed(() => {
  const seen = new Set<string>()
  return days.value.flatMap((day) => {
    const value = day.date === null ? 'undated' : day.key.slice(0, 7)
    if (seen.has(value)) return []
    seen.add(value)
    return [
      {
        value,
        label:
          day.date === null
            ? t('library.journal.undated')
            : new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'long' }).format(
                day.date,
              ),
      },
    ]
  })
})
const selectedMonth = computed(() => {
  const key = activeDay.value || visibleDays.value[0]?.key || ''
  return key === 'undated' ? key : key.slice(0, 7)
})
function updateActiveDay(): void {
  const root = scroller.value
  if (!root) return
  const top = root.getBoundingClientRect().top
  const sections = [...root.querySelectorAll<HTMLElement>('[data-journal-day]')]
  activeDay.value =
    sections.find((element) => element.getBoundingClientRect().bottom > top + 30)?.dataset
      .journalDay ??
    visibleDays.value[0]?.key ??
    ''
}
async function showDays(start: number): Promise<void> {
  viewRevision += 1
  pageStart.value = start
  await nextTick()
  if (scroller.value) scroller.value.scrollTop = 0
  updateActiveDay()
  scroller.value?.querySelector<HTMLElement>('[data-journal-day]')?.focus({ preventScroll: true })
}
function jumpToMonth(value: string): void {
  const index = days.value.findIndex((day) => day.key.startsWith(value))
  if (index >= 0) void showDays(index)
}
function jumpToDay(key: string): void {
  const node = scroller.value?.querySelector<HTMLElement>(`[data-journal-day="${key}"]`)
  node?.scrollIntoView({ block: 'start' })
  node?.focus({ preventScroll: true })
  activeDay.value = key
}
function dateLabel(date: number | null): string {
  return date === null
    ? t('library.journal.undated')
    : new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric' }).format(date)
}
watch([range, filter], () => {
  viewRevision += 1
  pageStart.value = 0
  activeDay.value = ''
  if (scroller.value) scroller.value.scrollTop = 0
})
// Preserve the visible day's offset across background snapshot commits.
watch(
  journal,
  async () => {
    const root = scroller.value
    if (!root) return
    const revision = viewRevision
    const oldTop = root.scrollTop
    const top = root.getBoundingClientRect().top
    const anchor = [...root.querySelectorAll<HTMLElement>('[data-journal-day]')].find(
      (element) => element.getBoundingClientRect().bottom > top + 30,
    )
    const key = anchor?.dataset.journalDay
    const offset = anchor ? anchor.getBoundingClientRect().top - top : 0
    const firstKey = root.querySelector<HTMLElement>('[data-journal-day]')?.dataset.journalDay
    const start = days.value.findIndex((day) => day.key === firstKey)
    pageStart.value =
      start >= 0 ? start : Math.min(pageStart.value, Math.max(0, days.value.length - 1))
    await nextTick()
    if (!active.value || revision !== viewRevision) return
    const target = key ? root.querySelector<HTMLElement>(`[data-journal-day="${key}"]`) : null
    root.scrollTop = target
      ? root.scrollTop +
        target.getBoundingClientRect().top -
        root.getBoundingClientRect().top -
        offset
      : oldTop
    updateActiveDay()
  },
  { flush: 'pre' },
)
async function selectRange(value: string): Promise<void> {
  const parsed = parseRecentAddedLibraryRange(value)
  if (parsed === null) return
  actionError.value = false
  try {
    await router.replace({ query: { ...route.query, range: String(parsed) } })
  } catch {
    actionError.value = true
  }
}
function selectFilter(value: string): void {
  if (value === 'all' || value === 'albums' || value === 'tracks') filter.value = value
}
async function openAlbum(album: AlbumSummary): Promise<void> {
  actionError.value = false
  try {
    await router.push({
      name: 'album-detail',
      query: { artist: album.albumArtist, title: album.title },
    })
  } catch {
    actionError.value = true
  }
}
async function playTrack(track: TrackListItem): Promise<void> {
  actionError.value = false
  try {
    await playback.playTrackFromQueue(
      buildAlbumPlaybackQueue(
        tracks.value,
        resolveAlbumArtist(track),
        resolveAlbumTitle(track),
        playback.state.playbackMode,
      ),
      track.id,
    )
  } catch {
    actionError.value = true
  }
}
function playAlbum(album: AlbumSummary): void {
  const first = catalog.value.selectTracks(album.albumArtist, album.title)[0]
  if (first) void playTrack(first)
}
</script>

<template>
  <section class="recent-page main-page-frame">
    <header class="journal-page-header">
      <h1>{{ t('sidebar.recentAdded') }}</h1>
      <div class="journal-range">
        <span id="journal-range-label" class="sr-only">{{ t('sidebar.recentAddedRange') }}</span
        ><SettingsSelect
          id="journal-range"
          labelledby="journal-range-label"
          :model-value="String(range)"
          :options="ranges"
          @update:model-value="selectRange"
        />
      </div>
    </header>
    <div class="journal-toolbar">
      <SettingsSegmentedControl
        id="journal-filter"
        :label="t('library.journal.filterLabel')"
        :model-value="filter"
        :options="filters"
        @update:model-value="selectFilter"
      />
      <div v-if="months.length" class="journal-month">
        <span id="journal-month-label" class="sr-only">{{ t('library.journal.jumpToMonth') }}</span
        ><SettingsSelect
          id="journal-month"
          labelledby="journal-month-label"
          :model-value="selectedMonth"
          :options="months"
          @update:model-value="jumpToMonth"
        />
      </div>
    </div>
    <MainPageStatus
      v-if="!pageLoaded && !pageError"
      kind="loading"
      :title="t('albums.status.loading')"
    />
    <MainPageStatus
      v-else-if="!pageLoaded && pageError"
      kind="error"
      :title="t('albums.status.loadError')"
      :action-label="t('library.status.retry')"
      @action="refresh"
    />
    <template v-else>
      <div v-if="pageError" class="journal-feedback" role="status">
        {{ t('library.journal.refreshFailed')
        }}<button type="button" :disabled="isRefreshing" @click="refresh">
          {{ t('library.status.retry') }}
        </button>
      </div>
      <div v-if="actionError" class="journal-feedback" role="alert">
        {{ t('library.recentAdded.actionError')
        }}<button
          type="button"
          :aria-label="t('library.journal.dismiss')"
          @click="actionError = false"
        >
          <span class="i-lucide-x" aria-hidden="true"></span>
        </button>
      </div>
      <div v-if="days.length" class="journal-body">
        <div
          ref="scroller"
          class="journal-scroll main-page-scroll"
          @scroll.passive="updateActiveDay"
        >
          <RecentJournalDay
            v-for="day in visibleDays"
            :key="day.key"
            :day="day"
            :now="now"
            :current-track-id="playback.state.currentTrackId"
            :is-playing="playback.state.isPlaying"
            @open="openAlbum"
            @play-album="playAlbum"
            @play-track="playTrack"
          />
          <nav
            v-if="pageStart > 0 || pageStart + 7 < days.length"
            class="journal-pagination"
            :aria-label="t('library.journal.dateNavigation')"
          >
            <button
              v-if="pageStart > 0"
              type="button"
              @click="showDays(Math.max(0, pageStart - 7))"
            >
              <span class="i-lucide-arrow-up" aria-hidden="true"></span
              >{{ t('library.journal.newer') }}</button
            ><button
              v-if="pageStart + 7 < days.length"
              type="button"
              @click="showDays(pageStart + 7)"
            >
              {{ t('library.journal.older')
              }}<span class="i-lucide-arrow-down" aria-hidden="true"></span>
            </button>
          </nav>
        </div>
        <nav class="journal-date-nav" :aria-label="t('library.journal.dateNavigation')">
          <button
            v-for="day in visibleDays"
            :key="day.key"
            type="button"
            :aria-current="(activeDay || visibleDays[0]?.key) === day.key ? 'date' : undefined"
            @click="jumpToDay(day.key)"
          >
            {{ dateLabel(day.date) }}
          </button>
        </nav>
      </div>
      <MainPageStatus
        v-else-if="!tracks.length"
        kind="empty"
        :title="t('library.recentAdded.empty')"
        :action-label="t('albums.status.manageSources')"
        @action="openSettings('library')"
      />
      <MainPageStatus
        v-else-if="!journal.length"
        kind="empty"
        :title="t('library.journal.emptyRange')"
        :action-label="t('sidebar.recentAddedRangeAll')"
        @action="selectRange('all')"
      />
      <MainPageStatus
        v-else
        kind="empty"
        :title="t('library.journal.emptyFilter')"
        :action-label="t('library.journal.all')"
        @action="filter = 'all'"
      />
    </template>
  </section>
</template>

<style scoped>
.recent-page {
  min-width: 0;
  color: var(--auralis-text);
  container-type: inline-size;
}
.journal-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 28px 28px 24px 0;
}
h1 {
  margin: 0;
}
h1 {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 18px;
  font-size: var(--auralis-type-page-size);
  line-height: var(--auralis-type-page-line-height);
  font-weight: 600;
}
.journal-range,
.journal-month {
  display: flex;
  justify-content: flex-end;
}
.journal-range {
  min-width: 100px;
  flex-shrink: 0;
}
.journal-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 0 12px;
  margin-right: 28px;
  border-bottom: 1px solid var(--auralis-border-subtle);
}
.journal-toolbar :deep(.settings-segmented-control) {
  gap: 4px;
}
.journal-toolbar :deep(.settings-segmented-option) {
  padding: 7px 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--auralis-text-muted);
  cursor: pointer;
  font: inherit;
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
}
.journal-toolbar :deep(.settings-segmented-option:hover),
.journal-toolbar :deep(.settings-segmented-option.is-selected) {
  background: var(--auralis-control-hover-bg);
  color: var(--auralis-text);
}
.journal-toolbar :deep(button:focus-visible) {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 2px;
}
.journal-month {
  min-width: 128px;
}
.journal-body {
  display: flex;
  flex: 1;
  min-height: 0;
  padding-top: 28px;
}
.journal-scroll {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 4px 24px calc(var(--auralis-playbar-safe-area, 100px) + 32px) 0;
  overflow-anchor: none;
}
.journal-date-nav {
  flex: 0 0 auto;
  width: max-content;
  min-width: 88px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: 0 6px;
  overflow-y: auto;
  padding-bottom: var(--auralis-playbar-safe-area, 100px);
}
button {
  cursor: pointer;
  font: inherit;
  background: transparent;
  border: 0;
  color: inherit;
}
button:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 2px;
}
.journal-date-nav button {
  flex-shrink: 0;
  white-space: nowrap;
  text-align: center;
  font-variant-numeric: tabular-nums;
  padding: 7px 8px;
  border-radius: 8px;
  color: var(--auralis-text-faint);
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
}
.journal-date-nav button[aria-current],
.journal-date-nav button:hover {
  background: var(--auralis-control-hover-bg);
  color: var(--auralis-text);
}
.journal-pagination {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 24px;
  padding: 12px 0;
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  color: var(--auralis-text-muted);
}
.journal-pagination button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
}
.journal-pagination button:hover {
  background: var(--auralis-control-hover-bg);
}
.journal-feedback {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 24px 0 0;
  font-size: var(--auralis-type-control-size);
  line-height: var(--auralis-type-control-line-height);
  color: var(--auralis-text-muted);
}
.journal-feedback button {
  color: var(--auralis-theme-accent);
  padding: 4px;
}
.journal-feedback button:disabled {
  opacity: 0.5;
  cursor: default;
}
@container (max-width: 650px) {
  .journal-page-header {
    flex-wrap: wrap;
    gap: 16px;
  }
  .journal-toolbar {
    flex-wrap: wrap;
  }
  .journal-date-nav {
    display: none;
  }
  .journal-scroll {
    padding-right: 20px;
  }
}
</style>
