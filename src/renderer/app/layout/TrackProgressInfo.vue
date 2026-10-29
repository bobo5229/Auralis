<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { useFullscreenPlayer } from '@renderer/features/playback/composables/useFullscreenPlayer'
import { getArtworkUrl } from '@renderer/shared/media/getArtworkUrl'
import { usePlaybackMetadataDisplay } from '@renderer/features/playback/composables/usePlaybackMetadataDisplay'
import {
  formatPlaybackClock,
  PLAYBACK_CLOCK_EMPTY,
} from '@renderer/features/playback/utils/formatPlaybackClock'
import PlayerBarProgress from './PlayerBarProgress.vue'

const props = withDefaults(
  defineProps<{
    /** Keep the progress child inside the modern PlayerBar identity card. */
    showProgress?: boolean
    /** Show current time, rail, and duration inside the modern island. */
    showSplitClocks?: boolean
  }>(),
  { showProgress: true, showSplitClocks: false },
)

const playback = usePlayback()
const { t } = useI18n()
const { songText, playbackSubtitle } = usePlaybackMetadataDisplay()
const { isFullscreenPlayerOpen, openFullscreenPlayer } = useFullscreenPlayer()
const imgError = ref(false)
const restoredCoverFocus = ref<'pointer' | 'keyboard' | null>(null)
let openedFullscreenFromCover = false
let openedFullscreenUsingKeyboard = false

const currentTrack = computed(() => playback.state.currentTrack)
const hasTrack = computed(() => currentTrack.value !== null)

const currentClockText = computed(() => formatPlaybackClock(playback.state.currentTime))

const durationClockText = computed(() =>
  playback.state.duration > 0 ? formatPlaybackClock(playback.state.duration) : PLAYBACK_CLOCK_EMPTY,
)

watch(
  () => playback.state.currentTrackId,
  () => {
    imgError.value = false
  },
)

function handleCoverClick(event: MouseEvent): void {
  restoredCoverFocus.value = null
  openedFullscreenFromCover = true
  openedFullscreenUsingKeyboard = event.detail === 0
  ;(event.currentTarget as HTMLElement).focus({ preventScroll: true })
  openFullscreenPlayer()
}

function handleCoverKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  restoredCoverFocus.value = null
  openedFullscreenFromCover = true
  openedFullscreenUsingKeyboard = true
  openFullscreenPlayer()
}

watch(isFullscreenPlayerOpen, (isOpen) => {
  if (!isOpen && openedFullscreenFromCover) {
    // 鼠标返回时隐藏轮廓；键盘进入全屏时保留可见焦点。
    restoredCoverFocus.value = openedFullscreenUsingKeyboard ? 'keyboard' : 'pointer'
    openedFullscreenFromCover = false
  }
})
</script>

<template>
  <div class="track-info-card">
    <!-- Empty state: brand mark only — no fake scrub animation. -->
    <div
      v-if="!hasTrack"
      class="track-info-empty flex w-full flex-col items-center justify-center gap-1"
    >
      <span
        class="text-sm font-semibold tracking-wide text-[var(--auralis-text-faint)] text-center"
      >
        Auralis
      </span>
      <div
        v-if="props.showProgress && props.showSplitClocks"
        class="player-bar-progress-row player-bar-progress-row--idle w-full"
      >
        <PlayerBarProgress :interactive="false" />
      </div>
      <PlayerBarProgress v-else-if="props.showProgress" :interactive="false" class="w-full" />
    </div>

    <!-- Track identity (+ optional inline progress) -->
    <div
      v-else-if="currentTrack"
      :class="{ 'track-info-with-split-clocks': props.showProgress && props.showSplitClocks }"
    >
      <div class="track-info-row">
        <div
          class="track-cover cursor-pointer"
          data-player-bar-artwork
          role="button"
          tabindex="0"
          :data-fullscreen-focus-restored="restoredCoverFocus ?? undefined"
          :aria-label="t('player.fullscreen')"
          @click="handleCoverClick"
          @keydown="handleCoverKeydown"
          @blur="restoredCoverFocus = null"
        >
          <img
            v-if="getArtworkUrl(currentTrack.artworkCacheKey) && !imgError"
            :src="getArtworkUrl(currentTrack.artworkCacheKey) ?? undefined"
            class="h-full w-full rounded-[inherit] object-cover"
            decoding="async"
            @error="imgError = true"
          />
          <div v-else class="flex h-full w-full items-center justify-center">
            <span class="i-lucide-music text-[var(--auralis-text-disabled)]"></span>
          </div>
          <span class="track-cover-fullscreen" aria-hidden="true">
            <span class="i-lucide-maximize-2 h-4 w-4"></span>
          </span>
        </div>
        <div class="track-text">
          <div class="track-title">
            {{ songText(currentTrack.title) || t('player.unknownTrack') }}
          </div>
          <div class="track-subtitle">
            {{ playbackSubtitle(currentTrack, '—') }}
          </div>
        </div>
      </div>
      <div
        v-if="props.showProgress && props.showSplitClocks"
        class="player-bar-hover-clocks"
        aria-hidden="true"
      >
        <span class="player-bar-progress-clock">{{ currentClockText }}</span>
        <span class="player-bar-progress-clock">{{ durationClockText }}</span>
      </div>
      <div v-if="props.showProgress && props.showSplitClocks" class="player-bar-progress-row">
        <PlayerBarProgress />
      </div>
      <PlayerBarProgress v-else-if="props.showProgress" />
    </div>
  </div>
</template>

<style scoped>
/* 轨道与悬停时间共用内容宽度，左端与封面对齐。 */
.track-info-with-split-clocks {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}

.track-info-with-split-clocks > .track-info-row {
  grid-column: 1;
  grid-row: 1;
}

.track-info-with-split-clocks > .player-bar-progress-row {
  grid-column: 1 / -1;
  grid-row: 2;
  grid-template-columns: subgrid;
  margin-top: 2px;
}

.player-bar-hover-clocks {
  grid-column: 1;
  grid-row: 1;
  z-index: 2;
  align-self: end;
  display: flex;
  justify-content: space-between;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
  transition:
    opacity 160ms ease,
    visibility 160ms;
}

.track-info-with-split-clocks:has(.track-progress:not(.track-progress--idle):hover)
  > .player-bar-hover-clocks {
  opacity: 1;
  visibility: visible;
}

:global([data-reduced-motion='true'] .player-bar-hover-clocks) {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .player-bar-hover-clocks {
    transition: none;
  }
}

.track-cover-fullscreen {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: inherit;
  background: rgb(0 0 0 / 42%);
  color: white;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.track-cover:hover .track-cover-fullscreen,
.track-cover:focus-visible:not([data-fullscreen-focus-restored='pointer']) .track-cover-fullscreen,
.track-cover[data-fullscreen-focus-restored='keyboard']:focus .track-cover-fullscreen {
  opacity: 1;
}

:global([data-reduced-motion='true'] .track-cover-fullscreen) {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .track-cover-fullscreen {
    transition: none;
  }
}

.track-cover[data-fullscreen-focus-restored='pointer']:focus-visible {
  outline: none;
}

.track-cover[data-fullscreen-focus-restored='keyboard']:focus {
  outline: 2px solid var(--auralis-active-album-accent, var(--auralis-player-static-accent));
  outline-offset: 2px;
}
</style>
