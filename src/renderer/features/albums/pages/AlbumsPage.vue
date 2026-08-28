<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { TrackListItem } from '@shared/types/libraryScan'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { useVisualStyle } from '@renderer/features/appearance/composables/useVisualStyle'
import '@renderer/features/appearance/styles/manuscript.tokens.css'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import LiquidGlassPanel from '@renderer/features/library/components/LiquidGlassPanel.vue'
import { normalizeSearchText } from '@renderer/features/library/utils/normalizeSearchText'
import AlbumCard from '../components/AlbumCard.vue'
import AlbumCatalogHeader from '../components/AlbumCatalogHeader.vue'
import type { AlbumSummary } from '../types'
import { resolveAlbumPresentation } from '../utils/albumPresentation'
import { resolveNextAlbumSearchMatch } from '../utils/albumSearchNavigation'
import '../styles/manuscript.css'
import '../styles/manuscript.overlays.css'

/**
 * 网格行左右阴影缓冲带：须覆盖默认侧倾 -12px 阴影与 hover 转正后的模糊外溢。
 * 须与 .albums-grid-row 的 padding-left/right 之和一致。
 */
const GRID_PADDING_X = 40
const COLUMN_GAP = 20
const ROW_GAP = 28
/** 封面下方固定元信息区：12px margin + 58px 文本块 */
const CARD_METADATA_HEIGHT = 70
/** 目标封面边长黄金区间 ~180–200px，用于加密列数 */
const TARGET_CARD_WIDTH = 190
const MAX_CARD_WIDTH = 210
const MIN_COLS = 3
const MAX_COLS = 6
const DEFAULT_ROW_HEIGHT = 240
const ALBUM_DISPLAY_MODE_KEY = 'auralis-albums-display-mode'
const ALBUMS_SCROLL_TOP_KEY = 'auralis-albums-scroll-top'

type AlbumDisplayMode = 'grid' | 'perspective'

interface AlbumContextMenuState {
  album: AlbumSummary
  x: number
  y: number
}

function readDisplayMode(): AlbumDisplayMode {
  return localStorage.getItem(ALBUM_DISPLAY_MODE_KEY) === 'perspective' ? 'perspective' : 'grid'
}

const tracks = shallowRef<TrackListItem[]>([])
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { visualStyle } = useVisualStyle()
const playback = usePlayback()
const isLoading = ref(true)
const loadError = ref<string | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
const columnCount = ref(4)
const rowHeight = ref(DEFAULT_ROW_HEIGHT)
const displayMode = ref<AlbumDisplayMode>(readDisplayMode())
const contextMenu = ref<AlbumContextMenuState | null>(null)
const searchQuery = ref('')
const isSearchFocused = ref(false)
const isSearchZoneHovered = ref(false)
const searchInputRef = ref<HTMLInputElement | null>(null)
const searchRootRef = ref<HTMLElement | null>(null)
const highlightedAlbumKey = ref<string | null>(null)
const searchOutcome = ref<'idle' | 'matched' | 'wrapped' | 'not-found'>('idle')
const searchMatchPosition = ref(0)
const searchMatchTotal = ref(0)
let lastSearchQuery = ''
let lastMatchedAlbumIndex = -1
let searchHighlightTimeout: ReturnType<typeof setTimeout> | null = null
let resizeObserver: ResizeObserver | null = null
let unsubscribeChanged: (() => void) | null = null
let restoreScrollFrame: number | null = null
let isPageUnmounted = false

const hasSearchQuery = computed(() => searchQuery.value.trim().length > 0)
const shouldRenderSearchBar = computed(
  () => isSearchZoneHovered.value || isSearchFocused.value || hasSearchQuery.value,
)
const albumPresentation = computed(() => resolveAlbumPresentation(route.name, visualStyle.value))
const isManuscriptAlbums = computed(() => albumPresentation.value === 'manuscript')
const searchFeedback = computed(() => {
  if (searchOutcome.value === 'not-found') return t('albums.search.notFound')
  if (searchOutcome.value === 'wrapped') {
    return t('albums.search.wrapped', {
      index: searchMatchPosition.value,
      total: searchMatchTotal.value,
    })
  }
  if (searchOutcome.value === 'matched') {
    return t('albums.search.matched', {
      index: searchMatchPosition.value,
      total: searchMatchTotal.value,
    })
  }
  return ''
})

watch(searchQuery, (query) => {
  if (!query.trim()) {
    searchOutcome.value = 'idle'
    lastSearchQuery = ''
    lastMatchedAlbumIndex = -1
  }
})

const albums = computed<AlbumSummary[]>(() => {
  const groupedAlbums = new Map<string, AlbumSummary>()

  for (const track of tracks.value) {
    const albumArtist = track.albumArtist || track.artist || 'Unknown Artist'
    const title = track.album || 'Unknown Album'
    const key = `${albumArtist}\u0000${title}`
    const existing = groupedAlbums.get(key)

    if (existing) {
      existing.releaseDate ??= track.releaseDate
      existing.artworkCacheKey ??= track.artworkCacheKey
      existing.tracks.push(track)
      continue
    }

    groupedAlbums.set(key, {
      key,
      title,
      albumArtist,
      releaseDate: track.releaseDate,
      artworkCacheKey: track.artworkCacheKey,
      tracks: [track],
    })
  }

  return [...groupedAlbums.values()]
})

const albumRows = computed(() => {
  const cols = columnCount.value
  const rows: AlbumSummary[][] = []
  for (let index = 0; index < albums.value.length; index += cols) {
    rows.push(albums.value.slice(index, index + cols))
  }
  return rows
})

const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: albumRows.value.length,
    getScrollElement: () => scrollRef.value,
    estimateSize: () => rowHeight.value,
    overscan: 2,
  })),
)

const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
const totalHeight = computed(() => rowVirtualizer.value.getTotalSize())

function updateAdaptiveGrid(): void {
  const container = scrollRef.value
  if (!container) return

  const availableWidth = Math.max(0, container.clientWidth - GRID_PADDING_X)

  // 按目标封面宽度 (~190px) 推算列数，并限制在 3~6；卡片过宽时优先加密列
  let cols = Math.floor((availableWidth + COLUMN_GAP) / (TARGET_CARD_WIDTH + COLUMN_GAP))
  cols = Math.min(MAX_COLS, Math.max(MIN_COLS, cols))

  let cardWidth = Math.max(1, (availableWidth - COLUMN_GAP * (cols - 1)) / cols)
  while (cols < MAX_COLS && cardWidth > MAX_CARD_WIDTH) {
    cols += 1
    cardWidth = Math.max(1, (availableWidth - COLUMN_GAP * (cols - 1)) / cols)
  }

  columnCount.value = cols
  rowHeight.value = cardWidth + CARD_METADATA_HEIGHT + ROW_GAP
  rowVirtualizer.value.measure()
}

function restoreScrollPosition(): void {
  const container = scrollRef.value
  if (!container) return

  const storedScrollTop = Number(sessionStorage.getItem(ALBUMS_SCROLL_TOP_KEY))
  if (!Number.isFinite(storedScrollTop) || storedScrollTop <= 0) return

  container.scrollTop = storedScrollTop
  rowVirtualizer.value.measure()
}

async function reloadAlbums(): Promise<void> {
  const nextTracks = await auralis.library.getTracks()
  if (!isPageUnmounted) tracks.value = nextTracks
}

async function loadAlbums(): Promise<void> {
  isLoading.value = true
  loadError.value = null
  try {
    await reloadAlbums()
  } catch (error) {
    if (!isPageUnmounted) {
      rendererDiagnostics.error({
        scope: 'albums.catalog',
        message: 'Failed to load albums',
        cause: error,
      })
      loadError.value = t('albums.status.loadError')
    }
  } finally {
    if (!isPageUnmounted) isLoading.value = false
  }

  if (isPageUnmounted || loadError.value) return
  await nextTick()
  updateAdaptiveGrid()
  resizeObserver?.disconnect()
  if (scrollRef.value) {
    resizeObserver = new ResizeObserver(updateAdaptiveGrid)
    resizeObserver.observe(scrollRef.value)
  }
  if (restoreScrollFrame !== null) cancelAnimationFrame(restoreScrollFrame)
  restoreScrollFrame = requestAnimationFrame(restoreScrollPosition)
}

function setDisplayMode(mode: AlbumDisplayMode): void {
  displayMode.value = mode
  localStorage.setItem(ALBUM_DISPLAY_MODE_KEY, mode)
}

function toggleDisplayModeFromContextMenu(): void {
  setDisplayMode(displayMode.value === 'grid' ? 'perspective' : 'grid')
  closeContextMenu()
}

function doesAlbumMatchSearch(album: AlbumSummary, normalizedQuery: string): boolean {
  if (!normalizedQuery) return false

  return [album.title, album.albumArtist].some((value) =>
    normalizeSearchText(value).startsWith(normalizedQuery),
  )
}

function locateNextSearchResult(): void {
  const query = searchQuery.value.trim()
  if (!query) {
    searchOutcome.value = 'idle'
    return
  }

  const isNewQuery = query !== lastSearchQuery
  if (isNewQuery) {
    lastSearchQuery = query
    lastMatchedAlbumIndex = -1
  }

  const normalizedQuery = normalizeSearchText(query)
  const matchingIndices = albums.value.flatMap((album, index) =>
    doesAlbumMatchSearch(album, normalizedQuery) ? [index] : [],
  )
  const match = resolveNextAlbumSearchMatch(matchingIndices, lastMatchedAlbumIndex, isNewQuery)
  searchMatchTotal.value = match.totalMatches
  if (match.targetIndex === null || match.matchPosition === null) {
    searchOutcome.value = 'not-found'
    return
  }

  const index = match.targetIndex
  const album = albums.value[index]
  lastMatchedAlbumIndex = index
  searchMatchPosition.value = match.matchPosition
  searchOutcome.value = match.wrapped ? 'wrapped' : 'matched'
  rowVirtualizer.value.scrollToIndex(Math.floor(index / columnCount.value), { align: 'center' })
  highlightedAlbumKey.value = album.key
  if (searchHighlightTimeout) clearTimeout(searchHighlightTimeout)
  searchHighlightTimeout = setTimeout(() => {
    highlightedAlbumKey.value = null
    searchHighlightTimeout = null
  }, 1800)
}

function onSearchKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter') return
  event.preventDefault()
  locateNextSearchResult()
}

function onAlbumsMouseMove(event: MouseEvent): void {
  const containerRect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  if (event.clientY - containerRect.top > 48) {
    isSearchZoneHovered.value = false
    return
  }

  const bar = searchRootRef.value
  if (!bar) {
    isSearchZoneHovered.value = true
    return
  }

  const barRect = bar.getBoundingClientRect()
  isSearchZoneHovered.value =
    event.clientX >= barRect.left &&
    event.clientX <= barRect.right &&
    event.clientY >= barRect.top &&
    event.clientY <= barRect.bottom
}

function onAlbumsMouseLeave(): void {
  if (!isSearchFocused.value && !hasSearchQuery.value) {
    isSearchZoneHovered.value = false
  }
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Node) || searchRootRef.value?.contains(target)) return

  isSearchFocused.value = false
  if (!hasSearchQuery.value) isSearchZoneHovered.value = false
}

function closeContextMenu(): void {
  contextMenu.value = null
}

function openContextMenu(album: AlbumSummary, event: MouseEvent): void {
  const menuWidth = 220
  const menuHeight = 190
  const x = Math.min(event.clientX, window.innerWidth - menuWidth - 8)
  const y = Math.min(event.clientY, window.innerHeight - menuHeight - 8)

  contextMenu.value = {
    album,
    x: Math.max(8, x),
    y: Math.max(8, y),
  }
}

function locateCurrentAlbum(): void {
  closeContextMenu()
  const currentTrack = playback.state.currentTrack
  if (!currentTrack) return

  const currentAlbumArtist = currentTrack.albumArtist || currentTrack.artist || 'Unknown Artist'
  const currentAlbumTitle = currentTrack.album || 'Unknown Album'
  void router.push({
    name: 'album-detail',
    query: {
      artist: currentAlbumArtist,
      title: currentAlbumTitle,
    },
  })
}

function buildAlbumPlaybackQueue(album: AlbumSummary): TrackListItem[] {
  if (playback.state.playbackMode !== 'sequential') {
    return album.tracks
  }

  const albumIndex = albums.value.findIndex((candidate) => candidate.key === album.key)
  if (albumIndex < 0) return album.tracks

  return albums.value.slice(albumIndex).flatMap((candidate) => candidate.tracks)
}

function playContextAlbum(): void {
  const album = contextMenu.value?.album
  closeContextMenu()
  if (!album || album.tracks.length === 0) return

  void playback.playTrackFromQueue(buildAlbumPlaybackQueue(album), album.tracks[0].id)
}

function insertContextAlbum(): void {
  const album = contextMenu.value?.album
  closeContextMenu()
  if (!album) return

  playback.insertTracksAfterCurrent(album.tracks)
}

function openAlbum(album: AlbumSummary): void {
  closeContextMenu()
  void router.push({
    name: 'album-detail',
    query: {
      artist: album.albumArtist,
      title: album.title,
    },
  })
}

onMounted(async () => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  await loadAlbums()
  if (isPageUnmounted) return

  unsubscribeChanged = auralis.library.onChanged((event) => {
    // Play-count ticks must not full-reload album summaries
    if (event.reason === 'play-stats-updated' || event.reason === 'play-stats-reset') return
    void reloadAlbums().catch((error) => {
      rendererDiagnostics.error({
        scope: 'albums.catalog',
        message: 'Failed to refresh albums',
        cause: error,
      })
    })
  })
})

onBeforeUnmount(() => {
  isPageUnmounted = true
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  if (scrollRef.value) {
    sessionStorage.setItem(ALBUMS_SCROLL_TOP_KEY, String(scrollRef.value.scrollTop))
  }
  if (restoreScrollFrame !== null) {
    cancelAnimationFrame(restoreScrollFrame)
  }
  if (searchHighlightTimeout) {
    clearTimeout(searchHighlightTimeout)
  }
  resizeObserver?.disconnect()
  unsubscribeChanged?.()
})
</script>

<template>
  <section
    class="albums-page relative flex h-full min-h-0 flex-col"
    :data-visual-style="albumPresentation"
    @mousemove="onAlbumsMouseMove"
    @mouseleave="onAlbumsMouseLeave"
  >
    <div class="library-search-zone">
      <Transition name="search-bar">
        <div
          v-if="shouldRenderSearchBar"
          ref="searchRootRef"
          class="library-search-bar"
          @pointerdown="searchInputRef?.focus()"
        >
          <span class="i-lucide-search text-sm text-[var(--auralis-text-faint)]"></span>
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            class="library-search-input"
            :placeholder="t('albums.search.placeholder')"
            :aria-label="t('albums.search.ariaLabel')"
            spellcheck="false"
            @focus="isSearchFocused = true"
            @blur="isSearchFocused = false"
            @keydown="onSearchKeydown"
          />
        </div>
      </Transition>
      <p v-if="isManuscriptAlbums" class="albums-search-feedback" aria-live="polite">
        {{ searchFeedback }}
      </p>
    </div>

    <div v-if="isLoading" class="albums-status-state flex flex-1 items-center justify-center">
      <p>{{ t('albums.status.loading') }}</p>
    </div>

    <div v-else-if="loadError" class="albums-status-state flex flex-1 items-center justify-center">
      <div class="albums-status-content">
        <p>{{ loadError }}</p>
        <button type="button" @click="loadAlbums">{{ t('albums.status.retry') }}</button>
      </div>
    </div>

    <template v-else>
      <!-- 统一水平内边距容器：Header 与网格物理像素对齐 -->
      <div class="albums-page-body">
        <AlbumCatalogHeader
          v-if="isManuscriptAlbums"
          :album-count="albums.length"
          :track-count="tracks.length"
        />
        <div class="albums-page-toolbar">
          <span v-if="isManuscriptAlbums" class="albums-toolbar-label">
            {{ t('albums.manuscript.viewLabel') }}
          </span>
          <div class="view-mode-switch" role="group" :aria-label="t('albums.view.ariaLabel')">
            <div
              class="view-mode-slider-thumb"
              :class="`is-${displayMode}`"
              aria-hidden="true"
            ></div>
            <button
              type="button"
              class="switch-btn"
              :class="{ 'is-active': displayMode === 'grid' }"
              :aria-pressed="displayMode === 'grid'"
              :aria-label="t('albums.view.grid')"
              :title="t('albums.view.grid')"
              @click="setDisplayMode('grid')"
            >
              <span class="i-lucide-grid-2x2 h-4 w-4 relative z-10" aria-hidden="true"></span>
            </button>
            <button
              type="button"
              class="switch-btn"
              :class="{ 'is-active': displayMode === 'perspective' }"
              :aria-pressed="displayMode === 'perspective'"
              :aria-label="t('albums.view.perspective')"
              :title="t('albums.view.perspective')"
              @click="setDisplayMode('perspective')"
            >
              <span
                class="i-lucide-panels-top-left h-4 w-4 relative z-10"
                aria-hidden="true"
              ></span>
            </button>
          </div>
        </div>

        <div
          v-if="albums.length > 0"
          ref="scrollRef"
          class="albums-scroll"
          :class="{ 'albums-scroll--perspective': displayMode === 'perspective' }"
        >
          <div
            class="relative w-full"
            :style="{ height: `${totalHeight}px` }"
            :aria-label="`${albums.length} albums`"
          >
            <div
              v-for="virtualRow in virtualRows"
              :key="String(virtualRow.key)"
              class="albums-grid-row absolute left-0 top-0 grid w-full gap-x-5"
              :style="{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
                gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                '--row-delay': `${(virtualRow.index % 6) * 40}ms`,
              }"
            >
              <AlbumCard
                v-for="(album, columnIndex) in albumRows[virtualRow.index]"
                :key="album.key"
                :album="album"
                :display-mode="displayMode"
                :highlighted="highlightedAlbumKey === album.key"
                :presentation="albumPresentation"
                :catalog-number="virtualRow.index * columnCount + columnIndex + 1"
                @open="openAlbum"
                @open-context-menu="openContextMenu"
              />
            </div>
          </div>
        </div>

        <div v-else class="albums-status-state flex flex-1 items-center justify-center">
          <p>{{ t('albums.status.empty') }}</p>
        </div>
      </div>
    </template>

    <Teleport to="body">
      <div
        v-if="contextMenu"
        class="albums-overlay fixed inset-0 z-[60]"
        :data-visual-style="albumPresentation"
        @click="closeContextMenu"
      >
        <LiquidGlassPanel
          class="library-context-menu fixed w-55"
          :presentation="albumPresentation"
          :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
          @click.stop
        >
          <button
            class="library-context-menu-item"
            type="button"
            :disabled="!playback.state.currentTrackId"
            @click="locateCurrentAlbum"
          >
            <span class="i-lucide-locate-fixed"></span>
            <span>{{ t('albums.contextMenu.locateCurrent') }}</span>
          </button>
          <div class="library-context-menu-separator"></div>
          <button class="library-context-menu-item" type="button" @click="playContextAlbum">
            <span class="i-lucide-play"></span>
            <span>{{ t('albums.contextMenu.play', { title: contextMenu.album.title }) }}</span>
          </button>
          <div class="library-context-menu-separator"></div>
          <button
            class="library-context-menu-item"
            type="button"
            :disabled="!playback.state.currentTrackId"
            @click="insertContextAlbum"
          >
            <span class="i-lucide-list-plus"></span>
            <span>{{ t('albums.contextMenu.insert', { title: contextMenu.album.title }) }}</span>
          </button>
          <div class="library-context-menu-separator"></div>
          <button
            class="library-context-menu-item"
            type="button"
            @click="toggleDisplayModeFromContextMenu"
          >
            <span
              :class="displayMode === 'grid' ? 'i-lucide-panels-top-left' : 'i-lucide-grid-2x2'"
            ></span>
            <span>
              {{
                displayMode === 'grid'
                  ? t('albums.contextMenu.switchToPerspective')
                  : t('albums.contextMenu.switchToGrid')
              }}
            </span>
          </button>
        </LiquidGlassPanel>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
/* 与网格共用同一水平内边距，消除 Header / 卡片列左右不对齐 */
.albums-page-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 0 32px;
}

.albums-status-state {
  color: var(--auralis-text-faint);
  font-size: 14px;
}

.albums-status-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.albums-status-content p {
  margin: 0;
}

.albums-status-content button {
  min-height: 32px;
  padding: 0 14px;
  border: 1px solid var(--auralis-border-subtle);
  border-radius: 10px;
  background: var(--auralis-control-hover-bg);
  color: var(--auralis-text);
  cursor: pointer;
}

.albums-status-content button:focus-visible {
  outline: 2px solid var(--auralis-progress-fill);
  outline-offset: 2px;
}

.albums-scroll {
  min-height: 0;
  flex: 1;
  overflow: auto;
  /* 首行与 Header 之间的呼吸区；避免元信息/3D 上沿贴死 */
  padding-top: 12px;
  padding-bottom: var(--auralis-playbar-safe-area);
  /* 预留滚动条槽，避免出现滚动条时内容相对 Header 横向偏移 */
  scrollbar-gutter: stable;
}

/* 3D 模式额外顶缓冲，避免首行侧倾投影被 Header 下沿裁切 */
.albums-scroll--perspective {
  padding-top: 12px;
}

.albums-grid-row {
  box-sizing: border-box;
  /* 左右 20px 阴影缓冲：默认侧倾 + hover 转正放大后的投影都不再被 overflow:auto 切硬边 */
  padding-left: 20px;
  padding-right: 20px;
  /* 行内允许 3D 阴影轻微溢出，避免相邻行互相裁切观感 */
  overflow: visible;
  transition:
    transform 0.4s cubic-bezier(0.25, 1, 0.5, 1),
    opacity 0.3s ease;
  transition-delay: var(--row-delay, 0ms);
}

.albums-page-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 8px 20px;
  margin-bottom: 8px;
}

/* 悬浮微光磨砂胶囊 (Floating Glass Pill Control) */
.view-mode-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  padding: 4px;
  border-radius: 14px;
  background: rgba(18, 20, 26, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.1),
    0 8px 24px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

/* 物理流体弹簧滑块 (Fluid Spring Thumb) */
.view-mode-slider-thumb {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 32px;
  height: 28px;
  border-radius: 10px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--auralis-sidebar-active-indicator, #6366f1) 75%, #ffffff 25%) 0%,
    color-mix(in srgb, var(--auralis-sidebar-active-indicator, #6366f1) 90%, #000000 10%) 100%
  );
  box-shadow:
    0 4px 14px color-mix(in srgb, var(--auralis-sidebar-active-indicator, #6366f1) 50%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
  transition:
    transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
    width 0.25s ease-out;
  pointer-events: none;
  z-index: 1;
}

.view-mode-slider-thumb.is-grid {
  transform: translateX(0);
}

.view-mode-slider-thumb.is-perspective {
  transform: translateX(32px);
}

.switch-btn {
  position: relative;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 28px;
  padding: 0;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: var(--auralis-text-muted);
  cursor: pointer;
  transition: color 0.25s ease;
}

.switch-btn:hover {
  color: #ffffff;
}

.switch-btn.is-active {
  color: #ffffff;
}

@media (prefers-reduced-motion: reduce) {
  .view-mode-slider-thumb {
    transition: none !important;
  }

  .albums-grid-row {
    transition: none !important;
    transition-delay: 0ms !important;
  }

  .switch-btn {
    transition: none;
  }
}
</style>
