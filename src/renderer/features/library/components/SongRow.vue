<script setup lang="ts">
import { ref, watch } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import { formatArtist } from '../utils/formatArtist'
import { formatDuration } from '../utils/formatDuration'

const props = defineProps<{
  track: TrackListItem
  nowPlaying: boolean
  index: number
  artworkUrl: string | null
}>()

defineEmits<{
  select: [trackId: number]
  play: [trackId: number]
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
    class="song-row"
    :class="
      nowPlaying
        ? 'bg-[var(--auralis-song-row-now-playing-bg)]'
        : index % 2 === 1
          ? 'bg-[var(--auralis-song-row-alt-bg)]'
          : 'bg-[var(--auralis-song-row-bg)]'
    "
    @click="$emit('select', track.id)"
    @dblclick="$emit('play', track.id)"
    @contextmenu.prevent="$emit('openContextMenu', track.id, $event)"
  >
    <div class="song-cover overflow-hidden">
      <img
        v-if="artworkUrl && !imgError"
        :src="artworkUrl"
        loading="lazy"
        class="h-full w-full object-cover"
        @error="imgError = true"
      />
      <span v-else class="i-lucide-music text-[var(--auralis-text-disabled)] text-sm"></span>
    </div>
    <div
      class="song-title"
      :class="{
        'text-[var(--auralis-song-row-now-playing-title)]': nowPlaying,
      }"
    >
      {{ track.title }}
    </div>
    <div
      class="song-artist"
      :class="{
        '!text-[var(--auralis-song-row-now-playing-artist)]': nowPlaying,
      }"
    >
      {{ formatArtist(track.artist) }}
    </div>
    <div
      class="song-album"
      :class="{
        '!text-[var(--auralis-song-row-now-playing-artist)]': nowPlaying,
      }"
    >
      {{ track.album }}
    </div>
    <div
      class="song-duration"
      :class="{
        '!text-[var(--auralis-song-row-now-playing-duration)]': nowPlaying,
      }"
    >
      {{ formatDuration(track.durationSeconds) }}
    </div>
  </div>
</template>
