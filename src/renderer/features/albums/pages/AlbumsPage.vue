<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import { observeElementOffset, observeElementRect, useVirtualizer } from '@tanstack/vue-virtual'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import type { TrackListItem } from '@shared/types/libraryScan'
import { auralis } from '@renderer/shared/ipc/client'
import { rendererDiagnostics } from '@renderer/shared/diagnostics/rendererDiagnostics'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { normalizeSearchText } from '@renderer/features/library/utils/normalizeSearchText'
import { prefetchArtworkPalette } from '@renderer/features/playback/composables/useArtworkPalette'
import { writeAlbumDetailSnapshot } from '../albumDetailSnapshot'
import AlbumCard from '../components/AlbumCard.vue'
import type { AlbumSummary } from '../types'
import { getAlbumCatalogIndex } from '../utils/albumCatalogIndex'
import { useAlbumCatalog } from '../composables/useAlbumCatalog'
import { resolveNextAlbumSearchMatch } from '../utils/albumSearchNavigation'

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

defineOptions({ name: 'AlbumsPage' })
const props = withDefaults(defineProps<{ isTransitioning?: boolean }>(), {
  isTransitioning: false,
})
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const playback = usePlayback()
const isPageActive = ref(false)
const canRefresh = computed(
  () => isPageActive.value && route.name === 'albums' && !props.isTransitioning,
)
const {
  tracks,
  isLoading,
  error: catalogError,
  refresh: loadAlbums,
} = useAlbumCatalog(auralis.library, canRefresh, (cause) =>
  rendererDiagnostics.error({
    scope: 'albums.catalog',
    message: 'Failed to load albums',
    cause,
  }),
)
const loadError = computed(() => (catalogError.value ? t('albums.status.loadError') : null))
const scrollRef = ref<HTMLElement | null>(null)
const columnCount = ref(4)
const rowHeight = ref(DEFAULT_ROW_HEIGHT)
const displayMode = ref<AlbumDisplayMode>(readDisplayMode())
const contextMenu = ref<AlbumContextMenuState | null>(null)
const searchQuery = ref('')
const isSearchFocused = ref(false)
const isTopZoneHovered = ref(false)
const isSearchBarHovered = ref(false)
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
let isPageUnmounted = false
let savedScrollTop = Number(sessionStorage.getItem(ALBUMS_SCROLL_TOP_KEY)) || 0

const hasSearchQuery = computed(() => searchQuery.value.trim().length > 0)
const isSearchZoneHovered = computed(() => isTopZoneHovered.value || isSearchBarHovered.value)
const shouldRenderSearchBar = computed(
  () => isSearchZoneHovered.value || isSearchFocused.value || hasSearchQuery.value,
)
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

const catalogIndex = computed(() => getAlbumCatalogIndex(tracks.value))
const albums = computed<AlbumSummary[]>(() => catalogIndex.value.albums)

let idlePalettePrefetchHandle: number | null = null
let idlePalettePrefetchMode: 'idle' | 'timeout' | null = null

function cancelIdlePalettePrefetch(): void {
  if (idlePalettePrefetchHandle == null) return
  if (idlePalettePrefetchMode === 'idle') window.cancelIdleCallback(idlePalettePrefetchHandle)
  else window.clearTimeout(idlePalettePrefetchHandle)
  idlePalettePrefetchHandle = null
  idlePalettePrefetchMode = null
}

function prefetchVisibleAlbumPalettes(): void {
  idlePalettePrefetchHandle = null
  idlePalettePrefetchMode = null
  if (isPageUnmounted || !canRefresh.value) return
  for (const virtualRow of rowVirtualizer.value.getVirtualItems()) {
    const row = albumRows.value[virtualRow.index]
    if (!row) continue
    for (const album of row) prefetchArtworkPalette(album.artworkCacheKey)
  }
}

function scheduleIdlePalettePrefetch(): void {
  cancelIdlePalettePrefetch()
  if (!canRefresh.value) return
  if (typeof window.requestIdleCallback === 'function') {
    idlePalettePrefetchMode = 'idle'
    idlePalettePrefetchHandle = window.requestIdleCallback(prefetchVisibleAlbumPalettes, {
      timeout: 1500,
    })
    return
  }
  idlePalettePrefetchMode = 'timeout'
  idlePalettePrefetchHandle = window.setTimeout(prefetchVisibleAlbumPalettes, 200)
}

function seedAlbumDetailSnapshot(album: AlbumSummary): void {
  prefetchArtworkPalette(album.artworkCacheKey)
  writeAlbumDetailSnapshot({
    albumArtist: album.albumArtist,
    albumTitle: album.title,
    artworkCacheKey: album.artworkCacheKey,
    releaseDate: album.releaseDate,
    tracks: album.tracks,
    moreAlbums: catalogIndex.value.moreAlbums(album.albumArtist, album.title),
    catalogTracks: tracks.value,
  })
}

const albumRows = computed(() => {
  const cols = columnCount.value
  const rows: AlbumSummary[][] = []
  for (let index = 0; index < albums.value.length; index += cols) {
    rows.push(albums.value.slice(index, index + cols))
  }
  return rows
})

const rowVirtualizer = useVirtualizer<HTMLElement, HTMLElement>(
  computed(() => ({
    count: albumRows.value.length,
    getScrollElement: () => scrollRef.value,
    estimateSize: () => rowHeight.value,
    overscan: 2,
    // KeepAlive moves this element to a detached tree. Ignore its zero geometry
    // and scroll resets so cached rows survive the complete leave/enter motion.
    observeElementRect: (instance, callback) =>
      observeElementRect(instance, (rect) => {
        if (instance.scrollElement?.isConnected && rect.width > 0 && rect.height > 0) callback(rect)
      }),
    observeElementOffset: (instance, callback) =>
      observeElementOffset(instance, (offset, scrolling) => {
        if (instance.scrollElement?.isConnected) callback(offset, scrolling)
      }),
  })),
)

const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
const totalHeight = computed(() => rowVirtualizer.value.getTotalSize())

function updateAdaptiveGrid(): boolean {
  const container = scrollRef.value
  if (!container?.isConnected || container.clientWidth === 0) return false

  const availableWidth = Math.max(0, container.clientWidth - GRID_PADDING_X)

  // 按目标封面宽度 (~190px) 推算列数，并限制在 3~6；卡片过宽时优先加密列
  let cols = Math.floor((availableWidth + COLUMN_GAP) / (TARGET_CARD_WIDTH + COLUMN_GAP))
  cols = Math.min(MAX_COLS, Math.max(MIN_COLS, cols))

  let cardWidth = Math.max(1, (availableWidth - COLUMN_GAP * (cols - 1)) / cols)
  while (cols < MAX_COLS && cardWidth > MAX_CARD_WIDTH) {
    cols += 1
    cardWidth = Math.max(1, (availableWidth - COLUMN_GAP * (cols - 1)) / cols)
  }

  const nextRowHeight = cardWidth + CARD_METADATA_HEIGHT + ROW_GAP
  if (columnCount.value !== cols || rowHeight.value !== nextRowHeight) {
    columnCount.value = cols
    rowHeight.value = nextRowHeight
    rowVirtualizer.value.measure()
    return true
  }
  return false
}

async function connectGrid(): Promise<void> {
  const container = scrollRef.value
  if (!container?.isConnected || !isPageActive.value) return
  // A resize while hidden can change total height. Commit that geometry before
  // restoring the offset, without waiting for another animation frame.
  if (updateAdaptiveGrid()) await nextTick()
  if (isPageUnmounted || !isPageActive.value || scrollRef.value !== container) return
  resizeObserver?.disconnect()
  resizeObserver = new ResizeObserver(updateAdaptiveGrid)
  resizeObserver.observe(container)
  // Activation hooks run before paint; no next-frame jump during the transition.
  if (Number.isFinite(savedScrollTop)) container.scrollTop = savedScrollTop
  scheduleIdlePalettePrefetch()
}

watch(isLoading, async (loading) => {
  if (!loading) {
    await nextTick()
    if (!isPageUnmounted) void connectGrid()
  }
})

watch(canRefresh, (allowed) => {
  if (allowed) scheduleIdlePalettePrefetch()
  else cancelIdlePalettePrefetch()
})

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
  const relativeY = event.clientY - containerRect.top
  isTopZoneHovered.value = relativeY >= 0 && relativeY <= 48

  const bar = searchRootRef.value
  if (bar) {
    const barRect = bar.getBoundingClientRect()
    isSearchBarHovered.value =
      event.clientX >= barRect.left &&
      event.clientX <= barRect.right &&
      event.clientY >= barRect.top &&
      event.clientY <= barRect.bottom
  } else {
    isSearchBarHovered.value = false
  }
}

function onAlbumsMouseLeave(): void {
  isTopZoneHovered.value = false
  isSearchBarHovered.value = false
}

function onDocumentPointerDown(event: PointerEvent): void {
  const target = event.target
  const bar = searchRootRef.value
  if (!(target instanceof Node) || (bar && (bar === target || bar.contains(target)))) return

  isSearchFocused.value = false
  if (!hasSearchQuery.value) {
    isTopZoneHovered.value = false
    isSearchBarHovered.value = false
  }
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
  const currentAlbum = albums.value.find(
    (album) => album.albumArtist === currentAlbumArtist && album.title === currentAlbumTitle,
  )
  if (currentAlbum) seedAlbumDetailSnapshot(currentAlbum)
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
  seedAlbumDetailSnapshot(album)
  void router.push({
    name: 'album-detail',
    query: {
      artist: album.albumArtist,
      title: album.title,
    },
  })
}

onActivated(() => {
  isPageActive.value = true
  document.addEventListener('pointerdown', onDocumentPointerDown)
  void connectGrid()
})

onBeforeRouteLeave(() => {
  if (scrollRef.value) savedScrollTop = scrollRef.value.scrollTop
  closeContextMenu()
})

function disconnectPage(): void {
  isPageActive.value = false
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  resizeObserver?.disconnect()
  cancelIdlePalettePrefetch()
}

onDeactivated(() => {
  disconnectPage()
  sessionStorage.setItem(ALBUMS_SCROLL_TOP_KEY, String(savedScrollTop))
})

onBeforeUnmount(() => {
  isPageUnmounted = true
  if (isPageActive.value && scrollRef.value) savedScrollTop = scrollRef.value.scrollTop
  disconnectPage()
  sessionStorage.setItem(ALBUMS_SCROLL_TOP_KEY, String(savedScrollTop))
  if (searchHighlightTimeout) {
    clearTimeout(searchHighlightTimeout)
  }
})
</script>

<template>
  <section
    class="albums-page relative flex h-full min-h-0 flex-col"
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
      <p v-if="hasSearchQuery" class="albums-search-feedback" aria-live="polite">
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
                v-for="(album, columnIndex) in albumRows[virtualRow.index]"
                :key="album.key"
                :album="album"
                :display-mode="displayMode"
                :highlighted="highlightedAlbumKey === album.key"
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
      <div v-if="contextMenu" class="albums-overlay fixed inset-0 z-[60]" @click="closeContextMenu">
        <div
          class="library-context-menu frosted-context-menu fixed w-55"
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
        </div>
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
  overflow-x: hidden;
  overflow-y: auto;
  /* 首行与 Header 之间的呼吸区；避免元信息/3D 上沿贴死 */
  padding-top: 12px;
  padding-bottom: var(--auralis-playbar-safe-area);
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
  transition: opacity 0.3s ease;
}

@media (prefers-reduced-motion: reduce) {
  .albums-grid-row {
    transition: none !important;
  }
}
</style>
