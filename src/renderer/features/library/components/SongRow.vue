<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TrackListItem } from '@shared/types/libraryScan'
import { useChineseTextDisplay } from '@renderer/features/appearance/composables/useChineseTextDisplay'
import { formatDuration } from '../utils/formatDuration'
import { formatMetadataDisplay } from '../utils/formatMetadataDisplay'
import type { LibraryFlatColumnId } from '../utils/libraryFlatColumnLayout'

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
    visibleColumns?: readonly LibraryFlatColumnId[]
  }>(),
  { focused: false, showPlayCount: false, visibleColumns: undefined },
)

const emit = defineEmits<{
  select: [trackId: number]
  play: [trackId: number]
  focus: [trackId: number]
  openContextMenu: [trackId: number, event: MouseEvent, openReason?: 'pointer' | 'keyboard']
}>()

const { t, locale } = useI18n()
const { songText, songValues } = useChineseTextDisplay()
const imgError = ref(false)
const titleDisplay = computed(() =>
  formatMetadataDisplay(songText(props.track.title), t('library.missing.title')),
)
const artistDisplay = computed(() =>
  formatMetadataDisplay(songValues(props.track.artist), t('library.missing.artist')),
)
const playCountDisplay = computed(() =>
  t(
    'library.playCount',
    { count: props.track.playCount.toLocaleString(locale.value) },
    { plural: props.track.playCount },
  ),
)
const defaultVisibleColumns = computed<readonly LibraryFlatColumnId[]>(() =>
  props.showPlayCount
    ? ['artwork', 'title', 'artist', 'album', 'play-count', 'duration']
    : ['artwork', 'title', 'artist', 'album', 'duration'],
)
const visibleColumns = computed(() => props.visibleColumns ?? defaultVisibleColumns.value)

watch(
  () => props.artworkUrl,
  () => (imgError.value = false),
)

function onKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return
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
    class="song-row library-flat-track-grid w-full items-center select-none cursor-pointer"
    :class="{
      'song-row--even': index % 2 === 0,
      'song-row--odd': index % 2 !== 0,
      'song-row--alt': index % 2 !== 0,
      'song-row--playing': nowPlaying,
      'song-row--selected': selected,
      'library-flat-track-grid--with-play-count': showPlayCount,
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
    @dblclick="emit('play', track.id)"
    @contextmenu.prevent="emit('openContextMenu', track.id, $event, 'pointer')"
    @keydown="onKeyDown"
    @focus="emit('focus', track.id)"
  >
    <div v-if="visibleColumns.includes('artwork')" class="song-cover overflow-hidden">
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
    <div
      v-if="visibleColumns.includes('title')"
      class="song-title min-w-0 library-flat-column--title"
    >
      <span v-tooltip.overflow="titleDisplay.text" class="song-title-main block truncate">{{
        titleDisplay.text
      }}</span>
    </div>
    <div
      v-if="visibleColumns.includes('artist')"
      class="song-artist min-w-0 library-flat-column--artist"
    >
      <span v-tooltip.overflow="artistDisplay.text" class="block truncate">{{
        artistDisplay.text
      }}</span>
    </div>
    <div
      v-if="visibleColumns.includes('album')"
      class="song-album min-w-0 library-flat-column--album"
    >
      <span v-tooltip.overflow="songText(track.album)" class="block truncate text-right">{{
        songText(track.album)
      }}</span>
    </div>
    <div
      v-if="visibleColumns.includes('play-count')"
      class="song-play-count library-flat-column--play-count text-right tabular-nums"
      :title="playCountDisplay"
    >
      {{ playCountDisplay }}
    </div>
    <div
      v-if="visibleColumns.includes('duration')"
      v-tooltip.overflow="formatDuration(track.durationSeconds)"
      class="song-duration library-flat-column--duration min-w-0 truncate text-right tabular-nums"
    >
      {{ formatDuration(track.durationSeconds) }}
    </div>
  </div>
</template>

<style scoped>
.song-title {
  font-weight: var(--auralis-song-list-title-weight, 700);
  font-size: var(--auralis-song-list-title-size, 14px);
  line-height: max(20px, 1.2em);
}

.song-artist {
  font-weight: var(--auralis-song-list-artist-weight, 600);
  font-size: var(--auralis-song-list-artist-size, 12px);
  line-height: max(16px, 1.2em);
}

.song-album {
  font-weight: var(--auralis-song-list-album-weight, 600);
  font-size: var(--auralis-song-list-album-size, 12px);
  line-height: max(16px, 1.2em);
}

.song-duration {
  font-weight: var(--auralis-song-list-duration-weight, 400);
  font-size: var(--auralis-song-list-duration-size, 12px);
  line-height: max(16px, 1.2em);
}

.song-play-count {
  overflow: hidden;
  color: var(--auralis-text-faint);
  font-size: var(--auralis-song-list-duration-size, 12px);
  font-weight: var(--auralis-song-list-duration-weight, 400);
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
