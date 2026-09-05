<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TrackListItem } from '@shared/types/libraryScan'
import type { LibraryPresentation } from '../types/libraryPresentation'
import { formatDuration } from '../utils/formatDuration'
import { formatArtist, isMultiValueArtist } from '../utils/formatArtist'
import { formatGenre } from '../utils/formatGenre'
import {
  formatMetadataDisplay,
  formatTrackDuration,
  formatTrackNumber,
} from '../utils/formatMetadataDisplay'

const props = withDefaults(
  defineProps<{
    track: TrackListItem
    nowPlaying: boolean
    isPlaying?: boolean
    selected?: boolean
    focused?: boolean
    index?: number
    presentation?: LibraryPresentation
  }>(),
  {
    isPlaying: false,
    selected: false,
    focused: false,
    index: 0,
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

function formatTrackNoModern(no: number | null): string {
  if (no == null) return ''
  return String(no).padStart(2, '0')
}

const titleDisplay = computed(() =>
  formatMetadataDisplay(props.track.title, t('library.manuscript.missing.title')),
)

const genreDisplay = computed(() =>
  formatMetadataDisplay(formatGenre(props.track.genre), t('library.manuscript.missing.genre')),
)

const durationDisplay = computed(() => formatTrackDuration(props.track.durationSeconds, '--:--'))

const trackNoDisplay = computed(() => formatTrackNumber(props.track.trackNo, '--'))

const compactSubInfo = computed(() => {
  const hasMultiArtist = isMultiValueArtist(props.track.artist)
  const artistText = hasMultiArtist ? formatArtist(props.track.artist) : ''
  const genreText = genreDisplay.value.text

  if (hasMultiArtist) {
    return {
      text: `${artistText} • ${genreText}`,
      missing: genreDisplay.value.missing,
    }
  }
  return {
    text: genreText,
    missing: genreDisplay.value.missing,
  }
})

function onRowClick(trackId: number): void {
  emit('select', trackId)
}

function onRowDoubleClick(trackId: number): void {
  emit('play', trackId)
}

function onRowContextMenu(trackId: number, event: MouseEvent): void {
  emit('openContextMenu', trackId, event, 'pointer')
}

function onRowKeyDown(event: KeyboardEvent): void {
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
    class="cover-track-row"
    :class="{
      'cover-track-row--playing': nowPlaying && (presentation === 'modern' || isPlaying),
      'cover-track-row--paused': presentation === 'manuscript' && nowPlaying && !isPlaying,
      'cover-track-row--manuscript': presentation === 'manuscript',
    }"
    :data-track-id="track.id"
    role="button"
    :tabindex="presentation === 'manuscript' && focused ? 0 : -1"
    :aria-pressed="selected"
    :aria-current="nowPlaying ? 'true' : undefined"
    :aria-label="
      t('library.a11y.songRow', {
        index: (index ?? 0) + 1,
        title: titleDisplay.text,
        artist: track.artist || '',
      })
    "
    @click="onRowClick(track.id)"
    @dblclick="onRowDoubleClick(track.id)"
    @contextmenu.prevent="onRowContextMenu(track.id, $event)"
    @keydown="onRowKeyDown"
    @focus="emit('focus', track.id)"
  >
    <span
      class="block w-full text-right text-xs font-bold text-[var(--auralis-text-muted)] tabular-nums font-mono select-none"
      :class="{ 'opacity-60': presentation === 'manuscript' && trackNoDisplay.missing }"
    >
      {{ presentation === 'manuscript' ? trackNoDisplay.text : formatTrackNoModern(track.trackNo) }}
    </span>
    <div class="min-w-0 flex flex-col justify-center overflow-hidden max-h-full">
      <span
        class="cover-track-title truncate text-sm font-bold leading-5 text-[var(--auralis-text)]"
        :class="{ 'italic opacity-70': presentation === 'manuscript' && titleDisplay.missing }"
        :title="presentation === 'manuscript' ? titleDisplay.text : (track.title ?? undefined)"
      >
        {{ presentation === 'manuscript' ? titleDisplay.text : (track.title ?? '') }}
      </span>
      <span
        v-if="isMultiValueArtist(track.artist)"
        class="cover-track-artist-line truncate text-xs font-bold leading-[14px] text-[var(--auralis-text-faint)]"
        :title="track.artist ?? undefined"
      >
        {{ formatArtist(track.artist) }}
      </span>
      <span
        v-if="presentation === 'manuscript'"
        class="cover-track-sub-info hidden truncate text-[11px] font-normal leading-[14px] text-[var(--manuscript-content-ledger-label)]"
        :class="{ 'italic opacity-60': compactSubInfo.missing }"
        :title="compactSubInfo.text"
      >
        {{ compactSubInfo.text }}
      </span>
    </div>
    <span
      class="cover-track-genre truncate text-right font-bold text-xs text-[var(--auralis-text-muted)] min-w-0"
      :class="{ 'italic opacity-60': presentation === 'manuscript' && genreDisplay.missing }"
      :title="
        presentation === 'manuscript' ? genreDisplay.text : formatGenre(track.genre) || undefined
      "
    >
      {{ presentation === 'manuscript' ? genreDisplay.text : formatGenre(track.genre) }}
    </span>
    <span
      class="text-right text-xs font-bold text-[var(--auralis-text-muted)] tabular-nums font-[var(--manuscript-font-numeric)]"
      :class="{ 'opacity-60': presentation === 'manuscript' && durationDisplay.missing }"
    >
      {{
        presentation === 'manuscript' ? durationDisplay.text : formatDuration(track.durationSeconds)
      }}
    </span>
  </div>
</template>

<style scoped>
/* Modern 保留既有缩进分隔线；Manuscript 使用不占盒模型的 inset line。 */
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
.cover-track-row--playing + .cover-track-row::before,
.cover-track-row--manuscript::before {
  display: none;
}
</style>
