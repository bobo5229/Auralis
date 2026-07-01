<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { useRouter } from 'vue-router'
import type { TrackListItem } from '@shared/types/libraryScan'
import { auralis } from '@renderer/shared/ipc/client'
import AlbumCard from '../components/AlbumCard.vue'
import type { AlbumSummary } from '../types'

const COLUMN_COUNT = 4
const GRID_PADDING_X = 64
const COLUMN_GAP = 20
const ROW_GAP = 28
const CARD_METADATA_HEIGHT = 70
const DEFAULT_ROW_HEIGHT = 240
const ALBUM_DISPLAY_MODE_KEY = 'auralis-albums-display-mode'

type AlbumDisplayMode = 'grid' | 'perspective'

function readDisplayMode(): AlbumDisplayMode {
  return localStorage.getItem(ALBUM_DISPLAY_MODE_KEY) === 'perspective' ? 'perspective' : 'grid'
}

const tracks = shallowRef<TrackListItem[]>([])
const router = useRouter()
const isLoading = ref(true)
const scrollRef = ref<HTMLElement | null>(null)
const rowHeight = ref(DEFAULT_ROW_HEIGHT)
const displayMode = ref<AlbumDisplayMode>(readDisplayMode())
let resizeObserver: ResizeObserver | null = null
let unsubscribeChanged: (() => void) | null = null

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

function compareOptionalText(left: string | null, right: string | null): number {
  if (left && right) return collator.compare(left, right)
  if (left) return -1
  if (right) return 1
  return 0
}

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

  return [...groupedAlbums.values()].sort((left, right) => {
    const artistOrder = collator.compare(left.albumArtist, right.albumArtist)
    if (artistOrder !== 0) return artistOrder

    const releaseDateOrder = compareOptionalText(left.releaseDate, right.releaseDate)
    if (releaseDateOrder !== 0) return releaseDateOrder

    return collator.compare(left.title, right.title)
  })
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

async function reloadAlbums(): Promise<void> {
  tracks.value = await auralis.library.getTracks()
}

function setDisplayMode(mode: AlbumDisplayMode): void {
  displayMode.value = mode
  localStorage.setItem(ALBUM_DISPLAY_MODE_KEY, mode)
}

function openAlbum(album: AlbumSummary): void {
  void router.push({
    name: 'album-detail',
    query: {
      artist: album.albumArtist,
      title: album.title,
    },
  })
}

onMounted(async () => {
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

  unsubscribeChanged = auralis.library.onChanged(reloadAlbums)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  unsubscribeChanged?.()
})
</script>

<template>
  <section class="relative flex h-full min-h-0 flex-col">
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
            @open="openAlbum"
          />
        </div>
      </div>
    </div>

    <div v-else class="flex flex-1 items-center justify-center">
      <p class="text-sm text-[var(--auralis-text-faint)]">
        No albums found. Add music folders in Settings.
      </p>
    </div>
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
