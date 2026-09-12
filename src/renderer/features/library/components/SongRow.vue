<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TrackListItem } from '@shared/types/libraryScan'
import { formatArtist } from '../utils/formatArtist'
import { formatDuration } from '../utils/formatDuration'
import { formatMetadataDisplay } from '../utils/formatMetadataDisplay'

const props = withDefaults(
  defineProps<{
    track: TrackListItem
    nowPlaying: boolean
    isPlaying: boolean
    selected: boolean
    focused?: boolean
    index: number
    artworkUrl: string | null
  }>(),
  { focused: false },
)

const emit = defineEmits<{
  select: [trackId: number]
  play: [trackId: number]
  focus: [trackId: number]
  openContextMenu: [trackId: number, event: MouseEvent, openReason?: 'pointer' | 'keyboard']
}>()

const { t } = useI18n()
const imgError = ref(false)
const titleDisplay = computed(() =>
  formatMetadataDisplay(props.track.title, t('library.missing.title')),
)
const artistDisplay = computed(() =>
  formatMetadataDisplay(formatArtist(props.track.artist), t('library.missing.artist')),
)

watch(
  () => props.artworkUrl,
  () => (imgError.value = false),
)

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
    class="song-row w-full items-center select-none cursor-pointer"
    :class="{
      'song-row--playing': nowPlaying,
      'song-row--selected': selected,
    }"
    :data-track-id="track.id"
    role="button"
    :tabindex="focused ? 0 : -1"
    :aria-pressed="selected"
    :aria-current="nowPlaying ? 'true' : undefined"
    :aria-label="
      t('library.a11y.songRow', {
        index: index + 1,
        title: titleDisplay.text,
        artist: artistDisplay.text,
      })
    "
    @click="emit('select', track.id)"
    @dblclick="emit('play', track.id)"
    @contextmenu.prevent="emit('openContextMenu', track.id, $event, 'pointer')"
    @keydown="onKeyDown"
    @focus="emit('focus', track.id)"
  >
    <div class="song-cover overflow-hidden">
      <img
        v-if="artworkUrl && !imgError"
        :src="artworkUrl"
        loading="lazy"
        decoding="async"
        draggable="false"
        class="h-full w-full object-cover"
        @error="imgError = true"
      />
      <span v-else class="i-lucide-music text-sm text-[var(--auralis-text-disabled)]"></span>
    </div>
    <div class="song-title min-w-0" :title="titleDisplay.text">
      <span class="song-title-main block truncate">{{ titleDisplay.text }}</span>
    </div>
    <div class="song-artist min-w-0" :title="artistDisplay.text">
      <span class="block truncate">{{ artistDisplay.text }}</span>
    </div>
    <div class="song-album min-w-0" :title="track.album ?? undefined">
      <span class="block truncate text-right">{{ track.album }}</span>
    </div>
    <div class="song-duration min-w-0 text-right tabular-nums">
      {{ formatDuration(track.durationSeconds) }}
    </div>
  </div>
</template>
