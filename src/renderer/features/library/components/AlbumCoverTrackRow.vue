<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { TrackListItem } from '@shared/types/libraryScan'
import { formatDuration } from '../utils/formatDuration'
import { formatArtist, isMultiValueArtist } from '../utils/formatArtist'
import { formatGenre } from '../utils/formatGenre'

const props = withDefaults(
  defineProps<{
    track: TrackListItem
    nowPlaying: boolean
    selected?: boolean
    focused?: boolean
    index?: number
  }>(),
  { selected: false, focused: false, index: 0 },
)

const emit = defineEmits<{
  select: [trackId: number]
  play: [trackId: number]
  focus: [trackId: number]
  openContextMenu: [trackId: number, event: MouseEvent, openReason?: 'pointer' | 'keyboard']
}>()
const { t } = useI18n()

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === ' ') {
    event.preventDefault()
    emit('select', props.track.id)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    emit('play', props.track.id)
  } else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
    event.preventDefault()
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    emit(
      'openContextMenu',
      props.track.id,
      new MouseEvent('contextmenu', {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }),
      'keyboard',
    )
  }
}
</script>

<template>
  <div
    class="cover-track-row"
    :class="{ 'cover-track-row--playing': nowPlaying }"
    :data-track-id="track.id"
    role="button"
    :tabindex="focused ? 0 : -1"
    :aria-pressed="selected"
    :aria-current="nowPlaying ? 'true' : undefined"
    :aria-label="
      t('library.a11y.songRow', {
        index: index + 1,
        title: track.title ?? '',
        artist: track.artist ?? '',
      })
    "
    @click="emit('select', track.id)"
    @dblclick="emit('play', track.id)"
    @contextmenu.prevent="emit('openContextMenu', track.id, $event, 'pointer')"
    @keydown="onKeyDown"
    @focus="emit('focus', track.id)"
  >
    <span
      class="block w-full text-right text-xs font-bold text-[var(--auralis-text-muted)] tabular-nums font-mono select-none"
    >
      {{ track.trackNo == null ? '' : String(track.trackNo).padStart(2, '0') }}
    </span>
    <div class="min-w-0 flex flex-col justify-center overflow-hidden max-h-full">
      <span
        v-tooltip.overflow="track.title"
        class="cover-track-title truncate text-sm font-bold leading-5 text-[var(--auralis-text)]"
        >{{ track.title ?? '' }}</span
      >
      <span
        v-if="isMultiValueArtist(track.artist)"
        v-tooltip.overflow="formatArtist(track.artist)"
        class="cover-track-artist-line truncate text-xs font-bold leading-[14px] text-[var(--auralis-text-faint)]"
        >{{ formatArtist(track.artist) }}</span
      >
    </div>
    <span
      v-tooltip.overflow="formatGenre(track.genre)"
      class="cover-track-genre truncate text-right font-bold text-xs text-[var(--auralis-text-muted)] min-w-0"
      >{{ formatGenre(track.genre) }}</span
    >
    <span class="text-right text-xs font-bold text-[var(--auralis-text-muted)] tabular-nums">{{
      formatDuration(track.durationSeconds)
    }}</span>
  </div>
</template>

<style scoped>
.cover-track-row:not(:first-child)::before {
  content: '';
  position: absolute;
  top: 0;
  left: 12px;
  right: 12px;
  height: 1px;
  background: var(--auralis-border-subtle);
  pointer-events: none;
}
.cover-track-row--playing::before,
.cover-track-row--playing + .cover-track-row::before {
  display: none;
}
</style>
