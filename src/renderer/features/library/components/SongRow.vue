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
    showPlayCount?: boolean
  }>(),
  { focused: false, showPlayCount: false },
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
const playCountDisplay = computed(() =>
  t('library.playCount', { count: props.track.playCount.toLocaleString() }),
)

watch(
  () => props.artworkUrl,
  () => (imgError.value = false),
)

function onClick(event: MouseEvent): void {
  ;(event.currentTarget as HTMLElement | null)?.focus({ preventScroll: true })
  emit('focus', props.track.id)
}

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
      'song-row--even': index % 2 === 0,
      'song-row--odd': index % 2 !== 0,
      'song-row--alt': index % 2 !== 0,
      'song-row--playing': nowPlaying,
      'song-row--selected': selected,
      'song-row--with-play-count': showPlayCount,
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
      }) + (showPlayCount ? `，${playCountDisplay}` : '')
    "
    @click="onClick"
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
    <div class="song-title min-w-0">
      <span v-tooltip.overflow="titleDisplay.text" class="song-title-main block truncate">{{
        titleDisplay.text
      }}</span>
    </div>
    <div class="song-artist min-w-0">
      <span v-tooltip.overflow="artistDisplay.text" class="block truncate">{{
        artistDisplay.text
      }}</span>
    </div>
    <div class="song-album min-w-0">
      <span v-tooltip.overflow="track.album" class="block truncate text-right">{{
        track.album
      }}</span>
    </div>
    <div
      v-if="showPlayCount"
      class="song-play-count text-right tabular-nums"
      :title="playCountDisplay"
    >
      {{ playCountDisplay }}
    </div>
    <div class="song-duration min-w-0 text-right tabular-nums">
      {{ formatDuration(track.durationSeconds) }}
    </div>
  </div>
</template>

<style scoped>
.song-title {
  font-weight: var(--auralis-song-list-title-weight, 700);
}

.song-artist {
  font-weight: var(--auralis-song-list-artist-weight, 600);
}

.song-album {
  font-weight: var(--auralis-song-list-album-weight, 600);
}

.song-duration {
  font-weight: var(--auralis-song-list-duration-weight, 400);
}

.song-row.song-row--with-play-count {
  grid-template-columns:
    var(--library-flat-artwork-size) minmax(0, 1.5fr) minmax(0, 0.85fr) minmax(0, 1fr)
    80px 56px;
}

.song-play-count {
  overflow: hidden;
  color: var(--auralis-text-faint);
  font-size: 14px;
  font-weight: var(--auralis-song-list-duration-weight, 400);
  white-space: nowrap;
  text-overflow: ellipsis;
}

@container (max-width: 720px) {
  .song-row.song-row--with-play-count {
    grid-template-columns:
      var(--library-flat-artwork-size) minmax(0, 1.6fr) minmax(0, 0.8fr)
      minmax(0, 0.6fr) 80px 48px;
    gap: 8px;
    padding-right: 12px;
    padding-left: 12px;
  }
}

@container (max-width: 560px) {
  .song-row.song-row--with-play-count {
    grid-template-columns:
      var(--library-flat-artwork-size) minmax(0, 1.6fr) minmax(0, 0.8fr)
      80px 48px;
  }
  .song-row--with-play-count .song-album {
    display: none;
  }
}

@container (max-width: 440px) {
  .song-row.song-row--with-play-count {
    grid-template-columns: var(--library-flat-artwork-size) minmax(0, 1fr) 80px 48px;
  }
  .song-row--with-play-count .song-artist {
    display: none;
  }
}
</style>
