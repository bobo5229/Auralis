<script setup lang="ts">
import type { TrackListItem } from '@shared/types/libraryScan'
import { formatDuration } from '../utils/formatDuration'
import { formatArtist, isMultiValueArtist } from '../utils/formatArtist'
import { formatGenre } from '../utils/formatGenre'

function formatTrackNo(no: number | null): string {
  if (no == null) return ''
  return String(no).padStart(2, '0')
}

defineProps<{
  track: TrackListItem
  nowPlaying: boolean
}>()

const emit = defineEmits<{
  select: [trackId: number]
  play: [trackId: number]
  openContextMenu: [trackId: number, event: MouseEvent]
}>()

function onRowClick(trackId: number): void {
  emit('select', trackId)
}

function onRowDoubleClick(trackId: number): void {
  emit('play', trackId)
}

function onRowContextMenu(trackId: number, event: MouseEvent): void {
  emit('openContextMenu', trackId, event)
}
</script>

<template>
  <div
    class="cover-track-row"
    :class="{ 'cover-track-row--playing': nowPlaying }"
    :data-track-id="track.id"
    @click="onRowClick(track.id)"
    @dblclick="onRowDoubleClick(track.id)"
    @contextmenu.prevent="onRowContextMenu(track.id, $event)"
  >
    <span class="text-right text-xs font-bold text-[var(--auralis-text-muted)] tabular-nums">
      {{ formatTrackNo(track.trackNo) }}
    </span>
    <div class="min-w-0 flex flex-col justify-center">
      <span class="truncate text-sm font-bold leading-tight text-[var(--auralis-text)]">{{
        track.title ?? ''
      }}</span>
      <span
        v-if="isMultiValueArtist(track.artist)"
        class="truncate text-xs font-bold text-[var(--auralis-text-faint)] leading-tight mt-0.5"
      >
        {{ formatArtist(track.artist) }}
      </span>
    </div>
    <span
      class="overflow-hidden text-ellipsis whitespace-nowrap text-right font-bold text-xs text-[var(--auralis-text-muted)]"
      style="direction: rtl"
    >
      {{ formatGenre(track.genre) }}
    </span>
    <span class="text-right text-xs font-bold text-[var(--auralis-text-muted)] tabular-nums">
      {{ formatDuration(track.durationSeconds) }}
    </span>
  </div>
</template>
