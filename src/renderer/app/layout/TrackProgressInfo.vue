<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { useFullscreenPlayer } from '@renderer/features/playback/composables/useFullscreenPlayer'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
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
      <div v-if="props.showProgress && props.showSplitClocks" class="player-bar-progress-row">
        <span class="player-bar-progress-clock" aria-hidden="true">{{ currentClockText }}</span>
        <PlayerBarProgress />
        <span class="player-bar-progress-clock" aria-hidden="true">{{ durationClockText }}</span>
      </div>
      <PlayerBarProgress v-else-if="props.showProgress" />
    </div>
  </div>
</template>

<style scoped>
/* 共用时间列宽，让文字容器终止于进度轨道右端。 */
.track-info-with-split-clocks {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  column-gap: 8px;
}

.track-info-with-split-clocks > .track-info-row {
  grid-column: 1 / 3;
}

.track-info-with-split-clocks > .player-bar-progress-row {
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
}

.track-cover[data-fullscreen-focus-restored='pointer']:focus-visible {
  outline: none;
}

.track-cover[data-fullscreen-focus-restored='keyboard']:focus {
  outline: 2px solid var(--auralis-active-album-accent, var(--auralis-player-static-accent));
  outline-offset: 2px;
}
</style>
