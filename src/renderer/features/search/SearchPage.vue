<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { auralis } from '@renderer/shared/ipc/client'
import { libraryCatalogClient } from '@renderer/shared/catalog/libraryCatalogClient'
import { useAlbumCatalog } from '@renderer/features/albums/composables/useAlbumCatalog'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { resolveAlbumArtist, resolveAlbumTitle } from '@shared/utils/albumIdentity'
import { buildAlbumPlaybackQueue } from '@renderer/shared/catalog/albumPlaybackQueue'
import type { AlbumSummary } from '@shared/types/albumSummary'
import MainPageStatus from '@renderer/shared/components/MainPageStatus.vue'
import AlbumCard from '@renderer/shared/components/AlbumCard.vue'
import { useSettingsDialog } from '@renderer/features/settings/composables/useSettingsDialog'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { searchSession as session } from './searchSession'
import { useCatalogSearch } from './useCatalogSearch'
import { getAlbumCatalogIndex } from '@renderer/shared/catalog/albumCatalogIndex'
import { writeAlbumDetailSnapshot } from '@renderer/features/albums/albumDetailSnapshot'
import { useElementSize } from '@vueuse/core'
import SearchSongCard from './components/SearchSongCard.vue'
import { searchSongGrid } from './searchSongGrid'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const playback = usePlayback()
const { openSettings } = useSettingsDialog()
const active = computed(() => route.name === 'search')
const { tracks, isLoading, error, refresh } = useAlbumCatalog(auralis.library, active,
  (cause) => rendererDiagnostics.error({ scope: 'search.catalog', message: 'Failed to load search catalog', cause }), libraryCatalogClient)
const { songs, albums, busy, failed, retry } = useCatalogSearch(tracks, toRef(session, 'query'))
const input = ref<HTMLInputElement | null>(null)
const scroller = ref<HTMLElement | null>(null)
const { width: resultWidth, height: resultHeight } = useElementSize(scroller)
const songGrid = computed(() => searchSongGrid(resultWidth.value, resultHeight.value))
const actionError = ref(false)
const categories = ['all', 'songs', 'albums'] as const
const visibleSongs = computed(() => songs.value.slice(0, session.category === 'all' ? songGrid.value.previewLimit : Math.max(songGrid.value.pageSize, session.songLimit)))
const visibleAlbums = computed(() => albums.value.slice(0, session.category === 'all' ? songGrid.value.previewLimit : session.albumLimit))
const categoryCount = (category: string) => category === 'songs' ? songs.value.length : category === 'albums' ? albums.value.length : songs.value.length + albums.value.length

function selectCategory(category: typeof session.category): void { session.category = category }
function onSearchKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  session.query = ''
}
watch([() => session.query, () => session.category], () => {
  session.scrollTop = 0
  session.songLimit = 0
  session.albumLimit = 36
  session.selectedId = null
  if (scroller.value) scroller.value.scrollTop = 0
})
onMounted(async () => { await nextTick(); input.value?.focus({ preventScroll: true }) })
let restored = false
watch([busy, isLoading], ([searching, loading]) => {
  if (!searching && !loading) return
  if (scroller.value && restored) session.scrollTop = scroller.value.scrollTop
  restored = false
}, { flush: 'sync' })
watch([busy, isLoading, resultWidth], async () => {
  if (!busy.value && !isLoading.value && !restored && resultWidth.value > 0) {
    await nextTick()
    if (scroller.value) scroller.value.scrollTop = session.scrollTop
    restored = true
  }
})
onBeforeUnmount(() => { if (scroller.value && restored) session.scrollTop = scroller.value.scrollTop })

async function playSong(id: number): Promise<void> {
  actionError.value = false
  try { await playback.playTrackFromQueue(songs.value, id) } catch { actionError.value = true }
}
async function playAlbum(album: AlbumSummary): Promise<void> {
  const queue = buildAlbumPlaybackQueue(tracks.value, album.albumArtist, album.title, playback.state.playbackMode)
  if (!queue.length) return
  actionError.value = false
  try { await playback.playTrackFromQueue(queue, queue[0].id) } catch { actionError.value = true }
}
function openAlbum(album: Pick<AlbumSummary, 'albumArtist' | 'title'>): void {
  if (scroller.value) session.scrollTop = scroller.value.scrollTop
  const catalog = getAlbumCatalogIndex(tracks.value)
  const summary = catalog.albums.find((item) => item.albumArtist === album.albumArtist && item.title === album.title)
  writeAlbumDetailSnapshot({
    albumArtist: album.albumArtist, albumTitle: album.title,
    artworkCacheKey: summary?.artworkCacheKey ?? null, releaseDate: summary?.releaseDate ?? null,
    tracks: catalog.selectTracks(album.albumArtist, album.title),
    moreAlbums: catalog.moreAlbums(album.albumArtist, album.title), catalogTracks: tracks.value,
  })
  void router.push({ name: 'album-detail', query: { artist: album.albumArtist, title: album.title, returnTo: '/search' } })
}
function openSongAlbum(id: number): void {
  const track = songs.value.find((song) => song.id === id)
  if (track) openAlbum({ albumArtist: resolveAlbumArtist(track), title: resolveAlbumTitle(track) })
}
</script>

<template>
  <section class="search-page-container main-page-frame">
    <div class="search-page main-page-frame">
    <header class="search-header">
      <div class="search-title-row">
        <h1>{{ t('search.title') }}</h1>
        <div class="search-field">
          <span class="i-lucide-search" aria-hidden="true" />
          <input ref="input" v-model="session.query" type="search" :placeholder="t('search.placeholder')" :aria-label="t('search.title')" spellcheck="false" @keydown="onSearchKeydown" />
        </div>
      </div>
      <div class="search-categories" role="group" :aria-label="t('search.categories')">
        <button v-for="category in categories" :key="category" type="button" :aria-pressed="session.category === category" @click="selectCategory(category)">
          {{ t(`search.${category}`) }}<span v-if="session.query.trim() && !busy && !isLoading">{{ categoryCount(category) }}</span>
        </button>
      </div>
    </header>
    <MainPageStatus v-if="isLoading" kind="loading" :title="t('albums.status.loading')" />
    <MainPageStatus v-else-if="error" kind="error" :title="t('albums.status.loadError')" :action-label="t('library.status.retry')" @action="refresh" />
    <MainPageStatus v-else-if="!tracks.length" kind="empty" :title="t('library.recentAdded.empty')" :action-label="t('albums.status.manageSources')" @action="openSettings('library')" />
    <MainPageStatus v-else-if="!session.query.trim()" class="search-empty-hint" kind="empty" :show-icon="false" :title="t('search.empty')" />
    <MainPageStatus v-else-if="busy" kind="loading" :title="t('search.searching')" />
    <MainPageStatus v-else-if="failed" kind="error" :title="t('search.failed')" :action-label="t('library.status.retry')" @action="retry" />
    <MainPageStatus v-else-if="!categoryCount(session.category)" kind="empty" :title="t('search.noResults')" />
    <div v-else ref="scroller" class="search-results">
      <p v-if="actionError" role="alert">{{ t('library.recentAdded.actionError') }}</p>
      <section v-if="session.category !== 'albums' && songs.length" :aria-label="t('search.songs')">
        <div class="search-section-heading"><h2>{{ t('search.songs') }} <span>{{ songs.length }}</span></h2><button v-if="session.category === 'all' && songs.length > visibleSongs.length" type="button" @click="selectCategory('songs')">{{ t('search.viewAll') }}<span class="i-lucide-chevron-right" aria-hidden="true" /></button></div>
        <div class="search-songs" :style="{ gridTemplateColumns: `repeat(${songGrid.columns}, minmax(0, 1fr))` }">
          <SearchSongCard
            v-for="track in visibleSongs" :key="track.id" :track="track"
            :selected="session.selectedId === track.id" :current="playback.state.currentTrackId === track.id"
            :playing="playback.state.isPlaying" @select="session.selectedId = $event"
            @play="playSong" @open-album="openSongAlbum" />
        </div>
        <button v-if="session.category === 'songs' && visibleSongs.length < songs.length" class="search-more" type="button" @click="session.songLimit = visibleSongs.length + songGrid.pageSize">{{ t('search.more', { count: songs.length - visibleSongs.length }) }}</button>
      </section>
      <section v-if="session.category !== 'songs' && albums.length" :aria-label="t('search.albums')">
        <div class="search-section-heading"><h2>{{ t('search.albums') }} <span>{{ albums.length }}</span></h2><button v-if="session.category === 'all' && albums.length > visibleAlbums.length" type="button" @click="selectCategory('albums')">{{ t('search.viewAll') }}<span class="i-lucide-chevron-right" aria-hidden="true" /></button></div>
        <div class="search-albums" :style="{ gridTemplateColumns: `repeat(${songGrid.columns}, minmax(0, 1fr))` }"><AlbumCard v-for="album in visibleAlbums" :key="album.key" :album="album" @open="openAlbum" @play="playAlbum" /></div>
        <button v-if="session.category === 'albums' && visibleAlbums.length < albums.length" class="search-more" type="button" @click="session.albumLimit += 36">{{ t('search.more', { count: albums.length - visibleAlbums.length }) }}</button>
      </section>
    </div>
    </div>
  </section>
</template>

<style scoped>
.search-page-container { min-width: 0; padding: 0; container: auralis-search / inline-size; }
.search-page { position: relative; padding: 0 28px 0 var(--main-page-inset-start); }
.search-header { flex-shrink: 0; padding-top: 28px; border-bottom: 1px solid var(--auralis-border-subtle); }
.search-title-row { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
h1 { margin: 0; font-size: var(--auralis-type-page-size); line-height: var(--auralis-type-page-line-height); font-weight: 600; }
.search-field { display: flex; flex: 0 1 440px; align-items: center; min-width: 0; gap: 10px; height: 38px; padding: 0 14px; border-radius: 999px; background: var(--auralis-search-bg); border: 1px solid var(--auralis-search-border); box-shadow: var(--auralis-search-shadow); }
.search-field > span { width: 16px; height: 16px; flex-shrink: 0; color: var(--auralis-text-muted); }
.search-field:focus-within { border-color: var(--auralis-theme-accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--auralis-theme-accent) 18%, transparent); }
.search-field input { width: 100%; min-width: 0; border: 0; outline: 0; padding: 0; background: transparent; color: var(--auralis-text); font: inherit; font-size: var(--auralis-type-control-size); line-height: var(--auralis-type-control-line-height); }
.search-field input::placeholder { color: var(--auralis-text-faint); }
.search-empty-hint { position: absolute; inset: 0; pointer-events: none; }
.search-empty-hint :deep(h3) { color: var(--auralis-text-muted); font-size: var(--auralis-type-control-size); line-height: var(--auralis-type-control-line-height); font-weight: 400; }
.search-field input::-webkit-search-cancel-button { -webkit-appearance: none; width: 16px; height: 16px; cursor: pointer; background: var(--auralis-text-muted); mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round'%3E%3Cpath d='M18 6 6 18M6 6l12 12'/%3E%3C/svg%3E") center / contain no-repeat; }
.search-categories { display: flex; flex-wrap: wrap; gap: 4px; margin: 20px 0 12px; }
button { font: inherit; color: inherit; cursor: pointer; }
.search-categories button { display: inline-flex; align-items: baseline; gap: 8px; padding: 7px 12px; border: 0; border-radius: 8px; background: transparent; color: var(--auralis-text-muted); font-size: var(--auralis-type-control-size); line-height: var(--auralis-type-control-line-height); }
.search-categories button[aria-pressed='true'], .search-categories button:hover { background: var(--auralis-control-hover-bg); color: var(--auralis-text); }
button:focus-visible { outline: 2px solid var(--auralis-focus-ring); outline-offset: 2px; }
.search-results { min-height: 0; overflow: auto; flex: 1; margin-inline: -6px; padding: 24px 6px calc(var(--auralis-playbar-safe-area) + 32px); scrollbar-width: none; }
.search-results section + section { margin-top: 32px; }
.search-section-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 16px; }
h2 { display: flex; align-items: baseline; gap: 8px; margin: 0; font-size: var(--auralis-type-section-size); line-height: var(--auralis-type-section-line-height); font-weight: 600; }
h2 span, .search-categories span { color: var(--auralis-text-faint); font-size: var(--auralis-type-caption-size); line-height: var(--auralis-type-caption-line-height); font-weight: 400; font-variant-numeric: tabular-nums; }
.search-section-heading > button { display: inline-flex; align-items: center; gap: 4px; border: 0; border-radius: 8px; background: transparent; color: var(--auralis-text-muted); padding: 6px 8px; font-size: var(--auralis-type-control-size); line-height: var(--auralis-type-control-line-height); }
.search-section-heading > button > span { width: 14px; height: 14px; }
.search-section-heading > button:hover, .search-more:hover { color: var(--auralis-text); background: var(--auralis-control-hover-bg); }
.search-more { display: block; min-height: 36px; margin: 24px auto 0; padding: 7px 16px; border: 1px solid var(--auralis-border-subtle); border-radius: 8px; background: transparent; color: var(--auralis-text-muted); font-size: var(--auralis-type-control-size); line-height: var(--auralis-type-control-line-height); }
.search-songs, .search-albums { display: grid; align-items: start; gap: 16px 20px; }
.search-albums :deep(.album-card) { display: grid; grid-template-columns: 80px minmax(0, 1fr); align-items: center; gap: 14px; padding: 12px; border-radius: calc(var(--album-list-cover-radius) + 12px); background: var(--auralis-control-hover-bg); }
.search-albums :deep(.album-card:hover) { background: color-mix(in srgb, var(--auralis-control-hover-bg) 60%, var(--auralis-surface-raised)); }
.search-albums :deep(.cover-frame) { box-shadow: none; }
.search-albums :deep(.album-card-meta) { height: auto; margin-top: 0; }
.search-albums :deep(.album-card-play) { width: 32px; height: 32px; left: 6px; bottom: 6px; }
.search-albums :deep(.album-card-play svg) { width: 18px; height: 18px; }
@container auralis-search (width < 600px) {
  .search-title-row { flex-wrap: wrap; gap: 16px; }
  .search-field { flex: 1 1 100%; }
}
@container auralis-search (width < 520px) { .search-page { padding-inline: 16px; } }
</style>
