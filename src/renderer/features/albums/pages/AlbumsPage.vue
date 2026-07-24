<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { useRouter } from 'vue-router'
import type { TrackListItem } from '@shared/types/libraryScan'
import { auralis } from '@renderer/shared/ipc/client'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import LiquidGlassPanel from '@renderer/features/library/components/LiquidGlassPanel.vue'
import { normalizeSearchText } from '@renderer/features/library/utils/normalizeSearchText'
import AlbumCard from '../components/AlbumCard.vue'
import type { AlbumSummary } from '../types'

/** 水平内边距已上移到 .albums-page-body，scroll 内不再重复扣 padding */
const GRID_PADDING_X = 0
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
const router = useRouter()
const playback = usePlayback()
const isLoading = ref(true)
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
let lastSearchQuery = ''
let lastMatchedAlbumIndex = -1
let searchHighlightTimeout: ReturnType<typeof setTimeout> | null = null
let resizeObserver: ResizeObserver | null = null
let unsubscribeChanged: (() => void) | null = null
let restoreScrollFrame: number | null = null

const hasSearchQuery = computed(() => searchQuery.value.trim().length > 0)
const shouldRenderSearchBar = computed(
  () => isSearchZoneHovered.value || isSearchFocused.value || hasSearchQuery.value,
)

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

const uniqueArtistCount = computed(() => {
  return new Set(albums.value.map((a) => a.albumArtist)).size
})

const releaseYearSpan = computed(() => {
  const years = albums.value
    .map((a) => a.releaseDate?.slice(0, 4))
    .filter((y): y is string => !!y && /^\d{4}$/.test(y))
    .map((y) => Number(y))

  if (years.length === 0) return '——'
  const min = Math.min(...years)
  const max = Math.max(...years)
  return min === max ? `${min}` : `${min} - ${max}`
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
  tracks.value = await auralis.library.getTracks()
}

function setDisplayMode(mode: AlbumDisplayMode): void {
  displayMode.value = mode
  localStorage.setItem(ALBUM_DISPLAY_MODE_KEY, mode)
}

function toggleDisplayModeFromContextMenu(): void {
  setDisplayMode(displayMode.value === 'grid' ? 'perspective' : 'grid')
  closeContextMenu()
}

function doesAlbumMatchSearch(album: AlbumSummary, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return false

  return [album.title, album.albumArtist].some((value) =>
    normalizeSearchText(value).startsWith(normalizedQuery),
  )
}

function locateNextSearchResult(): void {
  const query = searchQuery.value.trim()
  if (!query) return

  if (query !== lastSearchQuery) {
    lastSearchQuery = query
    lastMatchedAlbumIndex = -1
  }

  for (let offset = 1; offset <= albums.value.length; offset += 1) {
    const index = (lastMatchedAlbumIndex + offset) % albums.value.length
    const album = albums.value[index]
    if (!doesAlbumMatchSearch(album, query)) continue

    lastMatchedAlbumIndex = index
    rowVirtualizer.value.scrollToIndex(Math.floor(index / columnCount.value), { align: 'center' })
    highlightedAlbumKey.value = album.key
    if (searchHighlightTimeout) clearTimeout(searchHighlightTimeout)
    searchHighlightTimeout = setTimeout(() => {
      highlightedAlbumKey.value = null
      searchHighlightTimeout = null
    }, 1800)
    return
  }
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
  try {
    await reloadAlbums()
  } finally {
    isLoading.value = false
  }

  await nextTick()
  updateAdaptiveGrid()
  if (scrollRef.value) {
    resizeObserver = new ResizeObserver(updateAdaptiveGrid)
    resizeObserver.observe(scrollRef.value)
  }

  restoreScrollFrame = requestAnimationFrame(restoreScrollPosition)
  unsubscribeChanged = auralis.library.onChanged((event) => {
    // Play-count ticks must not full-reload album summaries
    if (event.reason === 'play-stats-updated' || event.reason === 'play-stats-reset') return
    void reloadAlbums()
  })
})

onBeforeUnmount(() => {
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
    class="relative flex h-full min-h-0 flex-col"
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
            placeholder="搜索专辑、专辑艺术家"
            aria-label="Search albums and album artists"
            spellcheck="false"
            @focus="isSearchFocused = true"
            @blur="isSearchFocused = false"
            @keydown="onSearchKeydown"
          />
        </div>
      </Transition>
    </div>

    <div v-if="isLoading" class="flex flex-1 items-center justify-center">
      <p class="text-sm text-[var(--auralis-text-faint)]">Loading albums...</p>
    </div>

    <template v-else>
      <!-- 统一水平内边距容器：Header 与网格物理像素对齐 -->
      <div class="albums-page-body">
        <!-- 顶部黑曜石发烧 Header 展架 -->
        <header class="albums-header-shelf">
          <div class="shelf-title-group">
            <h1 class="shelf-title">唱片馆 ALBUMS</h1>
            <!-- 无胶囊双行工业仪器面板 (Two-Row Industrial Meter) -->
            <div class="stats-tworow-group">
              <div class="tworow-item">
                <span class="tworow-num">{{ albums.length }}</span>
                <span class="tworow-label">ALBUMS</span>
              </div>
              <div class="tworow-item">
                <span class="tworow-num">{{ uniqueArtistCount }}</span>
                <span class="tworow-label">ARTISTS</span>
              </div>
              <div class="tworow-item">
                <span class="tworow-num">{{ releaseYearSpan }}</span>
                <span class="tworow-label">ERA SPAN</span>
              </div>
            </div>
          </div>

          <div class="shelf-controls">
            <div class="view-mode-switch" role="group" aria-label="专辑视图模式">
              <button
                type="button"
                class="switch-btn"
                :class="{ 'is-active': displayMode === 'grid' }"
                :aria-pressed="displayMode === 'grid'"
                @click="setDisplayMode('grid')"
              >
                <span class="i-lucide-grid-2x2 h-3.5 w-3.5"></span>
                <span>常规网格</span>
              </button>
              <button
                type="button"
                class="switch-btn"
                :class="{ 'is-active': displayMode === 'perspective' }"
                :aria-pressed="displayMode === 'perspective'"
                @click="setDisplayMode('perspective')"
              >
                <span class="i-lucide-panels-top-left h-3.5 w-3.5"></span>
                <span>3D 透视展台</span>
              </button>
            </div>
          </div>
        </header>

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
              }"
            >
              <AlbumCard
                v-for="album in albumRows[virtualRow.index]"
                :key="album.key"
                :album="album"
                :display-mode="displayMode"
                :highlighted="highlightedAlbumKey === album.key"
                @open="openAlbum"
                @open-context-menu="openContextMenu"
              />
            </div>
          </div>
        </div>

        <div v-else class="flex flex-1 items-center justify-center">
          <p class="text-sm text-[var(--auralis-text-faint)]">
            No albums found. Add music folders in Settings.
          </p>
        </div>
      </div>
    </template>

    <Teleport to="body">
      <div v-if="contextMenu" class="fixed inset-0 z-[60]" @click="closeContextMenu">
        <LiquidGlassPanel
          class="library-context-menu fixed w-55"
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
            <span>定位到当前专辑</span>
          </button>
          <div class="library-context-menu-separator"></div>
          <button class="library-context-menu-item" type="button" @click="playContextAlbum">
            <span class="i-lucide-play"></span>
            <span>播放「{{ contextMenu.album.title }}」</span>
          </button>
          <div class="library-context-menu-separator"></div>
          <button
            class="library-context-menu-item"
            type="button"
            :disabled="!playback.state.currentTrackId"
            @click="insertContextAlbum"
          >
            <span class="i-lucide-list-plus"></span>
            <span>插播「{{ contextMenu.album.title }}」</span>
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
            <span>{{ displayMode === 'grid' ? '切换到透视封面视图' : '切换到常规封面视图' }}</span>
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

.albums-scroll {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding-bottom: var(--auralis-playbar-safe-area);
  /* 预留滚动条槽，避免出现滚动条时内容相对 Header 横向偏移 */
  scrollbar-gutter: stable;
}

/* 3D 模式给首行投影留出顶部安全区，避免被 overflow 裁成「平面」 */
.albums-scroll--perspective {
  padding-top: 8px;
}

.albums-grid-row {
  /* 行内允许 3D 阴影轻微溢出，避免相邻行互相裁切观感 */
  overflow: visible;
}

.albums-header-shelf {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  flex-shrink: 0;
  padding: 18px 24px;
  margin: 16px 0 12px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--auralis-dialog-bg, #1a1c20) 85%, #000);
  border: 1px solid color-mix(in srgb, var(--auralis-text) 12%, transparent);
  box-shadow:
    0 16px 40px rgba(0, 0, 0, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.shelf-title-group {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  min-width: 0;
}

.shelf-title {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.2;
  background: linear-gradient(
    135deg,
    var(--auralis-text) 0%,
    color-mix(in srgb, var(--auralis-text) 72%, transparent) 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* ── 无胶囊双行工业仪器面板 (Two-Row Industrial Meter) ─ */
.stats-tworow-group {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-left: 8px;
}

.tworow-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
}

.tworow-num {
  font-size: 17px;
  font-weight: 850;
  color: var(--auralis-text);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.tworow-label {
  font-size: 10px;
  font-weight: 800;
  color: var(--auralis-text-faint);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  line-height: 1;
}

.shelf-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.view-mode-switch {
  display: inline-flex;
  align-items: center;
  padding: 3px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.switch-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 9px;
  border: none;
  background: transparent;
  color: var(--auralis-text-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition:
    color 0.2s ease,
    background 0.2s ease,
    box-shadow 0.2s ease;
}

.switch-btn:hover {
  color: var(--auralis-text);
}

.switch-btn.is-active {
  background: color-mix(
    in srgb,
    var(--auralis-sidebar-active-indicator) 40%,
    rgba(255, 255, 255, 0.14)
  );
  color: #ffffff;
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

@media (prefers-reduced-motion: reduce) {
  .switch-btn {
    transition: none;
  }
}
</style>
