<script setup lang="ts">
import { ref, watch } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import { formatArtist } from '../utils/formatArtist'
import { formatDuration } from '../utils/formatDuration'

const props = defineProps<{
  track: TrackListItem
  selected: boolean
  index: number
  artworkUrl: string | null
  refreshing: boolean
}>()

defineEmits<{
  select: [trackId: number]
  play: [trackId: number]
  refreshMetadata: [trackId: number]
  openContextMenu: [trackId: number, event: MouseEvent]
}>()

const imgError = ref(false)

watch(
  () => props.artworkUrl,
  () => {
    imgError.value = false
  },
)
</script>

<template>
  <div
    class="song-row bg-[var(--auralis-song-row-bg)] hover:bg-[var(--auralis-song-row-hover-bg)]"
    :class="{
      'bg-[var(--auralis-song-row-alt-bg)]': index % 2 === 1 && !selected,
      'bg-[var(--auralis-song-row-selected-bg)]': selected,
    }"
    @click="$emit('select', track.id)"
    @dblclick="$emit('play', track.id)"
    @contextmenu.prevent="$emit('openContextMenu', track.id, $event)"
  >
    <div class="song-cover overflow-hidden">
      <img
        v-if="artworkUrl && !imgError"
        :src="artworkUrl"
        class="h-full w-full object-cover"
        @error="imgError = true"
      />
      <span v-else class="i-lucide-music text-[var(--auralis-text-disabled)] text-sm"></span>
    </div>
    <div class="song-title" :class="{ 'text-[var(--auralis-song-row-selected-text)]': selected }">
      {{ track.title }}
    </div>
    <div class="song-artist">{{ formatArtist(track.artist) }}</div>
    <div class="song-album">{{ track.album }}</div>
    <div class="song-duration">{{ formatDuration(track.durationSeconds) }}</div>
    <button
      class="song-action"
      type="button"
      title="Refresh Metadata"
      aria-label="Refresh Metadata"
      :disabled="refreshing"
      @click.stop="$emit('refreshMetadata', track.id)"
      @dblclick.stop
    >
      <span class="i-lucide-refresh-cw text-sm" :class="{ 'animate-spin': refreshing }"></span>
    </button>
  </div>
</template>
