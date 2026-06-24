<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import type { EditableTrackMetadata, TrackListItem } from '@shared/types/libraryScan'
import { auralis } from '@renderer/shared/ipc/client'
import SongRow from '../components/SongRow.vue'
import MetadataEditDialog from '../components/MetadataEditDialog.vue'
import { getArtworkUrl } from '../utils/getArtworkUrl'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'

const playback = usePlayback()

const tracks = ref<TrackListItem[]>([])
const isLoading = ref(true)
const scrollRef = ref<HTMLElement | null>(null)
const refreshingTrackIds = ref<Set<number>>(new Set())
const editingMetadata = ref<EditableTrackMetadata | null>(null)
const isSavingMetadata = ref(false)
const metadataEditError = ref<string | null>(null)

const rowVirtualizer = useVirtualizer(
  computed(() => ({
    count: tracks.value.length,
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
    rowVirtualizer.value.scrollToIndex(0)
  } finally {
    isLoading.value = false
  }
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
      <div :style="{ height: `${totalSize}px`, width: '100%', position: 'relative' }">
        <SongRow
          v-for="virtualRow in virtualRows"
          :key="virtualRow.key"
          :track="tracks[virtualRow.index]"
          :index="virtualRow.index"
          :selected="playback.state.selectedTrackId === tracks[virtualRow.index].id"
          :artwork-url="getArtworkUrl(tracks[virtualRow.index].artworkCacheKey)"
          :refreshing="isRefreshingTrack(tracks[virtualRow.index].id)"
          :style="{
            height: `${virtualRow.size}px`,
            transform: `translateY(${virtualRow.start}px)`,
          }"
          class="absolute left-0 top-0 w-full"
          @select="onSelect"
          @play="onPlay"
          @edit-metadata="onEditMetadata"
          @refresh-metadata="onRefreshMetadata"
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
  </section>
</template>
