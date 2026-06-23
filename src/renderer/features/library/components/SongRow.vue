<script setup lang="ts">
import type { TrackListItem } from '@shared/types/libraryScan'
import { formatArtist } from '../utils/formatArtist'
import { formatDuration } from '../utils/formatDuration'

defineProps<{
  track: TrackListItem
  selected: boolean
  index: number
}>()

defineEmits<{
  select: [trackId: number]
  play: [trackId: number]
}>()
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
  >
    <div class="song-cover">
      <span class="i-lucide-music text-ink/20 text-sm"></span>
    </div>
    <div class="song-title" :class="{ 'text-[var(--auralis-song-row-selected-text)]': selected }">
      {{ track.title }}
    </div>
    <div class="song-artist">{{ formatArtist(track.artist) }}</div>
    <div class="song-album">{{ track.album }}</div>
    <div class="song-duration">{{ formatDuration(track.durationSeconds) }}</div>
  </div>
</template>
