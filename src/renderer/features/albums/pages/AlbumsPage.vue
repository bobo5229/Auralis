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

const COLUMN_COUNT = 4
const GRID_PADDING_X = 64
const COLUMN_GAP = 20
const ROW_GAP = 28
const CARD_METADATA_HEIGHT = 70
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

const albumRows = computed(() => {
  const rows: AlbumSummary[][] = []
  for (let index = 0; index < albums.value.length; index += COLUMN_COUNT) {
    rows.push(albums.value.slice(index, index + COLUMN_COUNT))
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

function updateRowHeight(): void {
  const container = scrollRef.value
  if (!container) return

  const availableWidth = Math.max(0, container.clientWidth - GRID_PADDING_X)
  const cardWidth = Math.max(1, (availableWidth - COLUMN_GAP * (COLUMN_COUNT - 1)) / COLUMN_COUNT)
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
    rowVirtualizer.value.scrollToIndex(Math.floor(index / COLUMN_COUNT), { align: 'center' })
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
  const menuHeight = 150
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

function playContextAlbum(): void {
  const album = contextMenu.value?.album
  closeContextMenu()
  if (!album || album.tracks.length === 0) return

  void playback.playTrackFromQueue(album.tracks, album.tracks[0].id)
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
  updateRowHeight()
  if (scrollRef.value) {
    resizeObserver = new ResizeObserver(updateRowHeight)
    resizeObserver.observe(scrollRef.value)
  }

  restoreScrollFrame = requestAnimationFrame(restoreScrollPosition)
  unsubscribeChanged = auralis.library.onChanged(reloadAlbums)
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

    <div
      class="absolute right-10 top-7 z-10 flex items-center gap-1 rounded-lg bg-[var(--auralis-control-hover-bg)] p-1"
      role="group"
      aria-label="Album display style"
    >
      <button
        type="button"
        class="album-display-button"
        :class="{ 'album-display-button--active': displayMode === 'grid' }"
        :aria-pressed="displayMode === 'grid'"
        aria-label="Regular album covers"
        title="Regular album covers"
        @click="setDisplayMode('grid')"
      >
        <span class="i-lucide-grid-2x2 h-4 w-4"></span>
      </button>
      <button
        type="button"
        class="album-display-button"
        :class="{ 'album-display-button--active': displayMode === 'perspective' }"
        :aria-pressed="displayMode === 'perspective'"
        aria-label="Perspective album covers"
        title="Perspective album covers"
        @click="setDisplayMode('perspective')"
      >
        <span class="i-lucide-panels-top-left h-4 w-4"></span>
      </button>
    </div>

    <div v-if="isLoading" class="flex flex-1 items-center justify-center">
      <p class="text-sm text-[var(--auralis-text-faint)]">Loading albums...</p>
    </div>

    <div
      v-else-if="albums.length > 0"
      ref="scrollRef"
      class="min-h-0 flex-1 overflow-auto px-8 pb-[var(--auralis-playbar-safe-area)] pt-18"
    >
      <div
        class="relative w-full"
        :style="{ height: `${totalHeight}px` }"
        :aria-label="`${albums.length} albums`"
      >
        <div
          v-for="virtualRow in virtualRows"
          :key="String(virtualRow.key)"
          class="absolute left-0 top-0 grid w-full grid-cols-4 gap-x-5"
          :style="{
            height: `${virtualRow.size}px`,
            transform: `translateY(${virtualRow.start}px)`,
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
        </LiquidGlassPanel>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.album-display-button {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--auralis-text-muted);
}

.album-display-button:hover {
  color: var(--auralis-text);
}

.album-display-button--active {
  background: var(--auralis-control-active-bg);
  color: var(--auralis-text);
}
</style>
