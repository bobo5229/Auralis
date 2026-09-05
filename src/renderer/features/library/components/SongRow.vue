<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { LibraryPresentation } from '../types/libraryPresentation'
import { formatArtist } from '../utils/formatArtist'
import { formatDuration } from '../utils/formatDuration'
import { formatTrackIndexNumber } from '../constants/libraryArchivePresentation'
import { formatMetadataDisplay, formatTrackDuration } from '../utils/formatMetadataDisplay'
import LibraryArtworkPlaceholder from './LibraryArtworkPlaceholder.vue'

const props = withDefaults(
  defineProps<{
    track: TrackListItem
    nowPlaying: boolean
    isPlaying: boolean
    selected: boolean
    focused?: boolean
    index: number
    totalTracks?: number
    artworkUrl: string | null
    presentation?: LibraryPresentation
  }>(),
  {
    focused: false,
    totalTracks: 0,
    presentation: 'modern',
  },
)

const emit = defineEmits<{
  select: [trackId: number]
  play: [trackId: number]
  focus: [trackId: number]
  openContextMenu: [trackId: number, event: MouseEvent, openReason?: 'pointer' | 'keyboard']
}>()

const { t } = useI18n()
const imgError = ref(false)

watch(
  () => props.artworkUrl,
  () => {
    imgError.value = false
  },
)

const titleDisplay = computed(() =>
  formatMetadataDisplay(props.track.title, t('library.manuscript.missing.title')),
)

const artistDisplay = computed(() =>
  formatMetadataDisplay(formatArtist(props.track.artist), t('library.manuscript.missing.artist')),
)

const albumDisplay = computed(() =>
  formatMetadataDisplay(props.track.album, t('library.manuscript.missing.album')),
)

const durationDisplay = computed(() => formatTrackDuration(props.track.durationSeconds, '--:--'))

function onKeyDown(event: KeyboardEvent): void {
  if (props.presentation !== 'manuscript') return
  if (event.key === ' ') {
    event.preventDefault()
    event.stopPropagation()
    emit('select', props.track.id)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    emit('play', props.track.id)
  } else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
    event.preventDefault()
    event.stopPropagation()
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const fakeEvent = new MouseEvent('contextmenu', {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    })
    emit('openContextMenu', props.track.id, fakeEvent, 'keyboard')
  }
}
</script>

<template>
  <div
    :class="[
      'song-row w-full items-center select-none cursor-pointer',
      {
        'song-row--playing': nowPlaying && (presentation === 'modern' || isPlaying),
        'song-row--paused': presentation === 'manuscript' && nowPlaying && !isPlaying,
        'song-row--selected': selected,
        'song-row--manuscript': presentation === 'manuscript',
      },
    ]"
    :data-track-id="track.id"
    role="button"
    :tabindex="presentation === 'manuscript' && focused ? 0 : -1"
    :aria-pressed="selected"
    :aria-current="nowPlaying ? 'true' : undefined"
    :aria-label="
      t('library.a11y.songRow', {
        index: index + 1,
        title: titleDisplay.text,
        artist: artistDisplay.text,
      })
    "
    @click="$emit('select', track.id)"
    @dblclick="$emit('play', track.id)"
    @contextmenu.prevent="emit('openContextMenu', track.id, $event, 'pointer')"
    @keydown="onKeyDown"
    @focus="emit('focus', track.id)"
  >
    <div
      v-if="presentation === 'manuscript'"
      class="song-index flex items-center justify-center font-mono text-xs tabular-nums text-[var(--manuscript-content-ledger-label)] select-none min-w-0 w-full"
    >
      <template v-if="nowPlaying">
        <span class="sr-only">{{ formatTrackIndexNumber(index, totalTracks) }}</span>
        <span
          class="manuscript-status-stamp pointer-events-none rounded-[var(--manuscript-radius-control-inner)] border border-[var(--manuscript-content-stamp)] bg-[var(--manuscript-surface-stamp)] px-1 py-0.5 font-[var(--manuscript-font-ui)] text-[10px] font-bold text-[var(--manuscript-content-stamp)]"
        >
          {{
            isPlaying
              ? t('library.manuscript.status.playing')
              : t('library.manuscript.status.paused')
          }}
        </span>
      </template>
      <span v-else class="truncate block w-full text-center font-mono tabular-nums">
        {{ formatTrackIndexNumber(index, totalTracks) }}
      </span>
    </div>

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
      <LibraryArtworkPlaceholder v-else-if="presentation === 'manuscript'" size="row" />
      <span v-else class="i-lucide-music text-sm text-[var(--auralis-text-disabled)]"></span>
    </div>

    <div
      class="song-title min-w-0"
      :class="{
        'text-[var(--auralis-song-row-now-playing-title)]': nowPlaying,
      }"
      :title="presentation === 'manuscript' ? titleDisplay.text : (track.title ?? undefined)"
    >
      <template v-if="presentation === 'manuscript'">
        <span
          class="song-title-main block truncate"
          :class="{ 'italic opacity-70': titleDisplay.missing }"
        >
          {{ titleDisplay.text }}
        </span>
        <span
          class="song-title-sub-album hidden truncate text-[11px] font-normal text-[var(--manuscript-content-ledger-label)]"
          :class="{ 'italic opacity-70': albumDisplay.missing }"
        >
          {{ albumDisplay.text }}
        </span>
      </template>
      <template v-else>
        <span class="song-title-main block truncate">{{ track.title }}</span>
      </template>
    </div>

    <div
      class="song-artist min-w-0"
      :class="{
        '!text-[var(--auralis-song-row-now-playing-artist)]': nowPlaying,
      }"
      :title="presentation === 'manuscript' ? artistDisplay.text : (track.artist ?? undefined)"
    >
      <span
        class="block truncate"
        :class="{ 'italic opacity-70': presentation === 'manuscript' && artistDisplay.missing }"
      >
        {{ presentation === 'manuscript' ? artistDisplay.text : formatArtist(track.artist) }}
      </span>
    </div>

    <div
      class="song-album min-w-0"
      :class="{
        '!text-[var(--auralis-song-row-now-playing-artist)]': nowPlaying,
      }"
      :title="presentation === 'manuscript' ? albumDisplay.text : (track.album ?? undefined)"
    >
      <span
        class="block truncate text-right"
        :class="{ 'italic opacity-70': presentation === 'manuscript' && albumDisplay.missing }"
      >
        {{ presentation === 'manuscript' ? albumDisplay.text : track.album }}
      </span>
    </div>

    <div
      class="song-duration min-w-0 text-right font-[var(--manuscript-font-numeric)] tabular-nums"
      :class="{
        '!text-[var(--auralis-song-row-now-playing-duration)]': nowPlaying,
        'opacity-70': presentation === 'manuscript' && durationDisplay.missing,
      }"
    >
      {{
        presentation === 'manuscript' ? durationDisplay.text : formatDuration(track.durationSeconds)
      }}
    </div>
  </div>
</template>
