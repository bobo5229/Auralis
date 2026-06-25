<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import type { EditableTrackMetadata, TrackListItem } from '@shared/types/libraryScan'
import { auralis } from '@renderer/shared/ipc/client'
import SongRow from '../components/SongRow.vue'
import MetadataEditDialog from '../components/MetadataEditDialog.vue'
import { getArtworkUrl } from '../utils/getArtworkUrl'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'

const playback = usePlayback()

const tracks = shallowRef<TrackListItem[]>([])
const isLoading = ref(true)
const scrollRef = ref<HTMLElement | null>(null)
const refreshingTrackIds = ref<Set<number>>(new Set())
const editingMetadata = ref<EditableTrackMetadata | null>(null)
const isSavingMetadata = ref(false)
const metadataEditError = ref<string | null>(null)
const contextMenu = ref<{ trackId: number; x: number; y: number } | null>(null)
let unsubscribeChanged: (() => void) | null = null

const NATIVE_LIST_LIMIT = 6000
const shouldUseNativeList = computed(() => tracks.value.length <= NATIVE_LIST_LIMIT)

const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: tracks.value.length,
    enabled: !shouldUseNativeList.value,
    getScrollElement: () => scrollRef.value,
    estimateSize: () => 44,
    overscan: 12,
  })),
)

const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
const totalSize = computed(() => rowVirtualizer.value.getTotalSize())

function onSelect(trackId: number) {
  playback.selectTrack(trackId)
}

function onPlay(trackId: number) {
  playback.playTrackFromQueue(tracks.value, trackId)
}

function closeContextMenu(): void {
  contextMenu.value = null
}

function onOpenContextMenu(trackId: number, event: MouseEvent): void {
  playback.selectTrack(trackId)

  const menuWidth = 180
  const menuHeight = 92
  const x = Math.min(event.clientX, window.innerWidth - menuWidth - 8)
  const y = Math.min(event.clientY, window.innerHeight - menuHeight - 8)

  contextMenu.value = {
    trackId,
    x: Math.max(8, x),
    y: Math.max(8, y),
  }
}

function isRefreshingTrack(trackId: number): boolean {
  return refreshingTrackIds.value.has(trackId)
}

function setTrackRefreshing(trackId: number, refreshing: boolean): void {
  const next = new Set(refreshingTrackIds.value)

  if (refreshing) {
    next.add(trackId)
  } else {
    next.delete(trackId)
  }

  refreshingTrackIds.value = next
}

async function reloadTracks(): Promise<void> {
  tracks.value = await auralis.library.getTracks()
}

async function scrollToPlaybackTrack(): Promise<void> {
  const targetTrackId = playback.state.currentTrackId ?? playback.state.selectedTrackId

  if (!targetTrackId) {
    return
  }

  await nextTick()
  await new Promise((resolve) => window.requestAnimationFrame(resolve))

  if (shouldUseNativeList.value) {
    const targetRow = scrollRef.value?.querySelector<HTMLElement>(
      `[data-track-id="${targetTrackId}"]`,
    )
    targetRow?.scrollIntoView({ block: 'center' })
    return
  }

  const targetIndex = tracks.value.findIndex((track) => track.id === targetTrackId)

  if (targetIndex < 0) {
    return
  }

  rowVirtualizer.value.scrollToIndex(targetIndex, { align: 'center' })
}

async function waitForRefreshJob(jobId: number): Promise<void> {
  for (;;) {
    const status = await auralis.metadata.getRefreshStatus(jobId)

    if (!status || status.status === 'completed' || status.status === 'failed') {
      return
    }

    await new Promise((resolve) => window.setTimeout(resolve, 250))
  }
}

async function onRefreshMetadata(trackId: number): Promise<void> {
  closeContextMenu()

  if (isRefreshingTrack(trackId)) {
    return
  }

  setTrackRefreshing(trackId, true)

  try {
    const result = await auralis.metadata.refreshTrack(trackId)
    await waitForRefreshJob(result.jobId)
    await reloadTracks()
  } finally {
    setTrackRefreshing(trackId, false)
  }
}

async function onEditMetadata(trackId: number): Promise<void> {
  closeContextMenu()
  metadataEditError.value = null
  editingMetadata.value = await auralis.metadata.getTrackMetadata(trackId)
}

function closeMetadataEditor(): void {
  if (isSavingMetadata.value) {
    return
  }

  editingMetadata.value = null
  metadataEditError.value = null
}

async function saveMetadata(metadata: EditableTrackMetadata): Promise<void> {
  isSavingMetadata.value = true
  metadataEditError.value = null

  try {
    await auralis.metadata.updateTrackMetadata(metadata)
    await reloadTracks()
    editingMetadata.value = null
  } catch (error) {
    metadataEditError.value =
      error instanceof Error ? error.message : 'Unable to save metadata edits'
  } finally {
    isSavingMetadata.value = false
  }
}

onMounted(async () => {
  try {
    await reloadTracks()
  } finally {
    isLoading.value = false
  }

  await scrollToPlaybackTrack()

  unsubscribeChanged = auralis.library.onChanged(async () => {
    await reloadTracks()
  })
})

onBeforeUnmount(() => {
  unsubscribeChanged?.()
})
</script>

<template>
  <section class="flex h-full flex-col">
    <div v-if="isLoading" class="flex flex-1 items-center justify-center">
      <p class="text-sm text-[var(--auralis-text-faint)]">Loading library...</p>
    </div>

    <div
      v-else-if="tracks.length > 0"
      ref="scrollRef"
      class="flex-1 overflow-auto pb-[var(--auralis-playbar-safe-area)]"
    >
      <div v-if="shouldUseNativeList">
        <SongRow
          v-for="(track, index) in tracks"
          :key="track.id"
          v-memo="[
            track.id,
            track.title,
            track.artist,
            track.album,
            track.durationSeconds,
            track.artworkCacheKey,
            index,
            playback.state.currentTrackId === track.id,
          ]"
          :data-track-id="track.id"
          :track="track"
          :index="index"
          :now-playing="playback.state.currentTrackId === track.id"
          :artwork-url="getArtworkUrl(track.artworkCacheKey)"
          @select="onSelect"
          @play="onPlay"
          @open-context-menu="onOpenContextMenu"
        />
      </div>

      <div v-else :style="{ height: `${totalSize}px`, width: '100%', position: 'relative' }">
        <SongRow
          v-for="virtualRow in virtualRows"
          :key="String(virtualRow.key)"
          :track="tracks[virtualRow.index]"
          :index="virtualRow.index"
          :now-playing="playback.state.currentTrackId === tracks[virtualRow.index].id"
          :artwork-url="getArtworkUrl(tracks[virtualRow.index].artworkCacheKey)"
          :style="{
            height: `${virtualRow.size}px`,
            transform: `translateY(${virtualRow.start}px)`,
            willChange: 'transform',
          }"
          class="absolute left-0 top-0 w-full"
          @select="onSelect"
          @play="onPlay"
          @open-context-menu="onOpenContextMenu"
        />
      </div>
    </div>

    <div v-else class="flex flex-1 items-center justify-center">
      <p class="text-sm text-[var(--auralis-text-faint)]">
        No tracks found. Add music folders in Settings.
      </p>
    </div>

    <MetadataEditDialog
      :metadata="editingMetadata"
      :saving="isSavingMetadata"
      :error-message="metadataEditError"
      @close="closeMetadataEditor"
      @save="saveMetadata"
    />

    <Teleport to="body">
      <div v-if="contextMenu" class="fixed inset-0 z-[60]" @click="closeContextMenu">
        <div
          class="fixed w-45 rounded border border-[var(--auralis-border-subtle)] bg-[var(--auralis-sidebar-bg)] py-1 shadow-lg"
          :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
          @click.stop
        >
          <button
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--auralis-text-muted)] transition hover:bg-[var(--auralis-control-hover-bg)] hover:text-[var(--auralis-text)]"
            type="button"
            @click="onEditMetadata(contextMenu.trackId)"
          >
            <span class="i-lucide-pencil text-sm"></span>
            <span>Edit Metadata</span>
          </button>
          <button
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--auralis-text-muted)] transition hover:bg-[var(--auralis-control-hover-bg)] hover:text-[var(--auralis-text)] disabled:opacity-50"
            type="button"
            :disabled="isRefreshingTrack(contextMenu.trackId)"
            @click="onRefreshMetadata(contextMenu.trackId)"
          >
            <span
              class="i-lucide-refresh-cw text-sm"
              :class="{ 'animate-spin': isRefreshingTrack(contextMenu.trackId) }"
            ></span>
            <span>Refresh Metadata</span>
          </button>
        </div>
      </div>
    </Teleport>
  </section>
</template>
