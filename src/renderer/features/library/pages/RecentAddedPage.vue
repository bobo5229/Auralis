<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useElementSize } from '@vueuse/core'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import MainPageStatus from '@renderer/shared/components/MainPageStatus.vue'
import { useAlbumCatalog } from '@renderer/features/albums/composables/useAlbumCatalog'
import { getAlbumCatalogIndex } from '@renderer/features/albums/utils/albumCatalogIndex'
import { buildAlbumPlaybackQueue } from '@renderer/features/albums/utils/albumPlaybackQueue'
import type { AlbumSummary } from '@renderer/features/albums/types'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'
import { useSettingsDialog } from '@renderer/features/settings/composables/useSettingsDialog'
import RecentAddedHero from '../components/RecentAddedHero.vue'
import AlbumCard from '@renderer/features/albums/components/AlbumCard.vue'
import AlbumDetailTrackList from '@renderer/features/albums/components/AlbumDetailTrackList.vue'
import { useAlbumDetailPresentation } from '@renderer/features/albums/composables/useAlbumDetailPresentation'
import SettingsSegmentedControl from '@renderer/features/settings/components/SettingsSegmentedControl.vue'
import {
  parseRecentAddedLibraryRange,
  RECENT_ADDED_LIBRARY_RANGES,
} from '../utils/recentAddedLibrary'
import {
  recentAlbumCollection,
  filterRecentAlbums,
  groupRecentAlbumMonths,
} from '../utils/recentAlbumCollection'

defineOptions({ name: 'RecentAddedPage' })
const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const { songText, songValues } = useChineseTextDisplay()
const playback = usePlayback()
const { openSettings } = useSettingsDialog()
const active = computed(() => route.name === 'recent-added')
const { tracks, isLoading, error, refresh } = useAlbumCatalog(auralis.library, active, (cause) =>
  rendererDiagnostics.error({
    scope: 'recent-added.catalog',
    message: 'Failed to load recent albums',
    cause,
  }),
)
const now = ref(Date.now())
const range = computed(() => parseRecentAddedLibraryRange(route.query.range) ?? 'all')
const collection = computed(() => recentAlbumCollection(tracks.value))
const albums = computed(() => filterRecentAlbums(collection.value, range.value, now.value))
const catalog = computed(() => getAlbumCatalogIndex(tracks.value))
const query = ref('')
const visibleCount = ref(48)
const scroll = ref<HTMLElement | null>(null)
const { width: collectionWidth } = useElementSize(scroll)
const columnCount = computed(() => {
  const compact = collectionWidth.value <= 650
  const gap = compact ? 18 : 24
  const minimum = compact ? 128 : 150
  return Math.max(1, Math.floor((collectionWidth.value + gap) / (minimum + gap)))
})
const filtered = computed(() => {
  const search = query.value.trim().toLocaleLowerCase()
  return search
    ? albums.value.filter((album) =>
        `${songText(album.title)} ${songValues(album.albumArtist)}`
          .toLocaleLowerCase()
          .includes(search),
      )
    : albums.value
})
const sections = computed(() => groupRecentAlbumMonths(filtered.value.slice(0, visibleCount.value)))
const selectedKey = ref<string | null>(null)
const selected = computed(() => albums.value.find((album) => album.key === selectedKey.value))
const previewTracks = computed(() =>
  selected.value
    ? catalog.value.selectTracks(selected.value.albumArtist, selected.value.title)
    : [],
)
const { albumDiscGroups } = useAlbumDetailPresentation(
  previewTracks,
  computed(() => selected.value?.releaseDate ?? null),
)
const rangeOptions = computed(() => {
  const values: (number | 'all')[] = [...RECENT_ADDED_LIBRARY_RANGES]
  if (!values.includes(range.value)) values.push(range.value)
  return values.map((value) => ({ value: String(value), label: rangeLabel(value) }))
})
function selectRange(value: string): void {
  const parsed = parseRecentAddedLibraryRange(value)
  if (parsed !== null) void setRange(parsed)
}
const page = ref<HTMLElement | null>(null)
let returnFocus: HTMLElement | null = null
const actionError = ref(false)
let clock: ReturnType<typeof setInterval> | undefined
function syncClock(): void {
  if (document.visibilityState === 'visible') now.value = Date.now()
}
onMounted(() => {
  clock = setInterval(syncClock, 60_000)
  document.addEventListener('visibilitychange', syncClock)
})
onBeforeUnmount(() => {
  clearInterval(clock)
  document.removeEventListener('visibilitychange', syncClock)
})
watch([range, query], () => {
  visibleCount.value = 48
  selectedKey.value = null
})
watch(range, () => {
  if (scroll.value) scroll.value.scrollTop = 0
})
watch(albums, () => {
  if (!selected.value) selectedKey.value = null
})
function rangeLabel(value: number | 'all'): string {
  return value === 'all'
    ? t('sidebar.recentAddedRangeAll')
    : t('library.recentAdded.days', { count: value })
}
async function setRange(value: number | 'all'): Promise<void> {
  try {
    await router.replace({ query: { ...route.query, range: String(value) } })
  } catch {
    actionError.value = true
  }
}
function monthLabel(date: number | null): string {
  if (date === null) return t('library.recentAdded.undated')
  return new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'long' }).format(date)
}
function albumTitle(album: AlbumSummary): string {
  return album.title === 'Unknown Album' ? t('facets.unknownAlbum') : songText(album.title)
}
async function inspect(album: AlbumSummary): Promise<void> {
  if (selectedKey.value === album.key) return closePreview()
  if (!filtered.value.some((item) => item.key === album.key)) query.value = ''
  await nextTick()
  visibleCount.value = Math.max(
    visibleCount.value,
    albums.value.findIndex((item) => item.key === album.key) + 1,
  )
  returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  selectedKey.value = album.key
  await nextTick()
  const preview = page.value?.querySelector<HTMLElement>('.recent-album-preview')
  preview?.focus({ preventScroll: true })
  preview?.scrollIntoView({ block: 'nearest' })
}
async function closePreview(): Promise<void> {
  selectedKey.value = null
  await nextTick()
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true })
}
async function play(album: AlbumSummary, trackId?: number): Promise<void> {
  const first = trackId ?? catalog.value.selectTracks(album.albumArtist, album.title)[0]?.id
  if (first === undefined) return
  actionError.value = false
  try {
    await playback.playTrackFromQueue(
      buildAlbumPlaybackQueue(
        tracks.value,
        album.albumArtist,
        album.title,
        playback.state.playbackMode,
      ),
      first,
    )
  } catch {
    actionError.value = true
  }
}
async function openAlbum(album: AlbumSummary): Promise<void> {
  try {
    await router.push({
      name: 'album-detail',
      query: { artist: album.albumArtist, title: album.title },
    })
  } catch {
    actionError.value = true
  }
}
</script>

<template>
  <section ref="page" class="recent-page main-page-frame">
    <div ref="scroll" class="recent-page-scroll main-page-scroll">
      <header class="recent-page-header">
        <div>
          <h1>{{ t('sidebar.recentAdded') }}</h1>
          <p>{{ t('library.recentAdded.collectionDescription') }}</p>
        </div>
        <SettingsSegmentedControl
          id="recent-added-range"
          class="recent-ranges"
          :label="t('sidebar.recentAddedRange')"
          :model-value="String(range)"
          :options="rangeOptions"
          @update:model-value="selectRange"
        />
      </header>
      <MainPageStatus v-if="isLoading" kind="loading" :title="t('albums.status.loading')" />
      <MainPageStatus
        v-else-if="error"
        kind="error"
        :title="t('albums.status.loadError')"
        :action-label="t('library.status.retry')"
        @action="refresh"
      />
      <template v-else-if="albums.length">
        <RecentAddedHero :albums="albums" @open="inspect" @play="play" />
        <div v-if="actionError" class="recent-action-error" role="alert">
          {{ t('library.recentAdded.actionError') }}
        </div>
        <div class="recent-collection-toolbar">
          <div>
            <h2>{{ t('library.recentAdded.collectionTitle') }}</h2>
            <span>{{ t('library.recentAdded.albumCount', { count: albums.length }) }}</span>
          </div>
          <label class="recent-collection-search"
            ><span class="i-lucide-search" aria-hidden="true"></span
            ><input
              v-model="query"
              type="search"
              :placeholder="t('library.recentAdded.search')"
              :aria-label="t('library.recentAdded.search')"
          /></label>
        </div>
        <MainPageStatus
          v-if="!filtered.length"
          kind="empty"
          :title="t('library.recentAdded.noSearchResults')"
          :action-label="t('library.recentAdded.clearSearch')"
          @action="query = ''"
        />
        <section
          v-for="section in sections"
          :key="section.key"
          class="recent-month"
          :aria-label="monthLabel(section.date)"
        >
          <header class="recent-month-heading">
            <h3>{{ monthLabel(section.date) }}</h3>
            <span class="recent-month-line"></span>
          </header>
          <div class="recent-album-grid" :style="{ '--recent-columns': columnCount }">
            <AlbumCard
              v-for="album in section.albums"
              :key="album.key"
              :album="album"
              :class="{ 'is-selected': selectedKey === album.key }"
              @open="inspect(album)"
              @play="play(album)"
            />
            <section
              v-if="selected && section.albums.some((album) => album.key === selectedKey)"
              tabindex="-1"
              :style="{
                gridRow:
                  Math.floor(
                    section.albums.findIndex((album) => album.key === selectedKey) / columnCount,
                  ) + 2,
              }"
              class="recent-album-preview"
              :aria-label="albumTitle(selected)"
              @keydown.esc.stop="closePreview"
            >
              <header>
                <div>
                  <h4>{{ albumTitle(selected) }}</h4>
                  <p>
                    {{ songValues(selected.albumArtist) }} ·
                    {{ t('library.recentAdded.tracks', { count: selected.tracks.length }) }}
                  </p>
                </div>
                <button
                  type="button"
                  class="recent-preview-close"
                  :aria-label="t('library.recentAdded.closePreview')"
                  @click="closePreview"
                >
                  <span class="i-lucide-x" aria-hidden="true"></span>
                </button>
              </header>
              <div class="recent-preview-tracks">
                <AlbumDetailTrackList
                  :key="selected.key"
                  :groups="albumDiscGroups"
                  :album-artist="selected.albumArtist"
                  :selected-track-id="playback.state.selectedTrackId"
                  :current-track-id="playback.state.currentTrackId"
                  :is-playing="playback.state.isPlaying"
                  :highlighted-track-id="null"
                  @play="play(selected!, $event)"
                />
              </div>
              <footer>
                <button type="button" @click="play(selected)">
                  <span class="i-lucide-play" aria-hidden="true"></span
                  >{{ t('library.recentAdded.playAlbum') }}</button
                ><button type="button" @click="openAlbum(selected)">
                  {{ t('library.recentAdded.fullAlbum')
                  }}<span class="i-lucide-arrow-up-right" aria-hidden="true"></span>
                </button>
              </footer>
            </section>
          </div>
        </section>
        <button
          v-if="filtered.length > visibleCount"
          type="button"
          class="recent-load-more"
          @click="visibleCount += 48"
        >
          {{ t('library.recentAdded.loadMore') }}
        </button>
      </template>
      <MainPageStatus
        v-else
        kind="empty"
        :title="t('library.recentAdded.empty')"
        :description="
          t(tracks.length ? 'library.recentAdded.emptyRange' : 'albums.status.emptyDescription')
        "
        :action-label="
          t(tracks.length ? 'sidebar.recentAddedRangeAll' : 'albums.status.manageSources')
        "
        @action="tracks.length ? setRange('all') : openSettings('library')"
      />
    </div>
  </section>
</template>

<style scoped>
.recent-page {
  min-width: 0;
  height: 100%;
  color: var(--auralis-text);
}
.recent-page-scroll {
  min-height: 0;
  overflow: auto;
  flex: 1;
  padding: 28px 40px calc(var(--auralis-playbar-safe-area, 100px) + 32px);
  scrollbar-gutter: stable;
  container-type: inline-size;
}
.recent-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}
h1,
h2,
h3,
h4,
p {
  margin: 0;
}
.recent-page-header h1 {
  font-size: var(--auralis-type-page-size);
  line-height: var(--auralis-type-page-line-height);
  font-weight: 650;
}
.recent-page-header p {
  margin-top: 6px;
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  color: var(--auralis-text-faint);
}
button,
input {
  font: inherit;
}
button {
  cursor: pointer;
  border: 0;
  background: transparent;
  color: inherit;
}
button:focus-visible,
input:focus-visible {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 3px;
}
.recent-ranges {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 4px;
  background: var(--auralis-control-hover-bg);
  border-radius: 10px;
  flex-shrink: 0;
}
.recent-ranges :deep(button) {
  padding: 6px 10px;
  border-radius: 7px;
  font-size: var(--auralis-type-caption-size);
  line-height: var(--auralis-type-caption-line-height);
  color: var(--auralis-text-muted);
  white-space: nowrap;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.recent-ranges :deep(button[aria-checked='true']) {
  background: var(--auralis-surface-raised);
  color: var(--auralis-text);
  box-shadow: 0 1px 3px #00000012;
}
.recent-collection-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin: 36px 0 28px;
}
.recent-collection-toolbar > div {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.recent-collection-toolbar h2 {
  font-size: var(--auralis-type-section-size);
  line-height: var(--auralis-type-section-line-height);
  font-weight: 600;
}
.recent-collection-toolbar span,
.recent-month-heading {
  color: var(--auralis-text-faint);
  font-size: var(--auralis-type-caption-size);
}
.recent-collection-search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 220px;
  border-bottom: 1px solid var(--auralis-border-subtle);
  padding: 7px 0;
}
.recent-collection-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--auralis-text);
  font-size: var(--auralis-type-caption-size);
}
.recent-month + .recent-month {
  margin-top: 36px;
}
.recent-month-heading {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 20px;
}
.recent-month-heading h3 {
  font: inherit;
  font-weight: 500;
}
.recent-month-line {
  height: 1px;
  flex: 1;
  background: var(--auralis-border-subtle);
}
.recent-album-grid {
  display: grid;
  grid-template-columns: repeat(var(--recent-columns), minmax(0, 1fr));
  gap: 28px 24px;
  align-items: start;
}
.recent-album-preview {
  grid-column: 1/-1;
  padding: 24px;
  border-radius: var(--auralis-panel-radius, 20px);
  background: var(--auralis-control-hover-bg);
}
.recent-album-preview > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.recent-album-preview h4 {
  font-size: var(--auralis-type-section-size);
  line-height: var(--auralis-type-section-line-height);
  overflow-wrap: anywhere;
}
.recent-album-preview p {
  font-size: var(--auralis-type-caption-size);
  color: var(--auralis-text-muted);
  margin-top: 5px;
}
.recent-preview-close {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 8px;
}
.recent-preview-tracks {
  margin: 20px 0;
}
.recent-page :deep(.album-card.is-selected .cover-frame) {
  outline: 2px solid var(--auralis-text);
  outline-offset: 4px;
}
.recent-ranges :deep(button:focus-visible) {
  outline: 2px solid var(--auralis-focus-ring);
  outline-offset: 2px;
}
.recent-album-preview footer {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}
.recent-album-preview footer button {
  display: flex;
  gap: 7px;
  align-items: center;
  font-size: var(--auralis-type-caption-size);
  padding: 4px 0;
}
.recent-load-more {
  display: block;
  margin: 36px auto 0;
  padding: 10px 24px;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 8px;
  font-size: var(--auralis-type-control-size);
}
.recent-action-error {
  color: var(--auralis-danger);
  font-size: var(--auralis-type-control-size);
}
@container (max-width:650px) {
  .recent-page-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 16px;
  }
  .recent-album-grid {
    gap: 24px 18px;
  }
  .recent-collection-toolbar {
    flex-wrap: wrap;
    gap: 12px;
  }
}
@media (max-width: 900px) {
  .recent-page-scroll {
    padding-inline: 24px;
  }
}
</style>
