<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePlayback } from '@renderer/features/playback/composables/usePlayback'
import { useFullscreenPlayer } from '@renderer/features/playback/composables/useFullscreenPlayer'
import { getArtworkUrl } from '@renderer/features/library/utils/getArtworkUrl'
import { formatPlaybackSubtitle } from '@renderer/features/playback/utils/formatPlaybackSubtitle'
import {
  formatPlaybackClock,
  PLAYBACK_CLOCK_EMPTY,
} from '@renderer/features/playback/utils/formatPlaybackClock'
import PlayerBarProgress from './PlayerBarProgress.vue'

const props = withDefaults(
  defineProps<{
    /** Manuscript and the modern island keep an in-card progress child. */
    showProgress?: boolean
    /** Modern island: current time | rail | duration. Manuscript uses the colophon. */
    showSplitClocks?: boolean
  }>(),
  { showProgress: true, showSplitClocks: false },
)

const playback = usePlayback()
const { t } = useI18n()
const { openFullscreenPlayer } = useFullscreenPlayer()
const imgError = ref(false)

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

function handleCoverClick(): void {
  openFullscreenPlayer()
}

function handleCoverKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  openFullscreenPlayer()
}
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
    <div v-else-if="currentTrack">
      <div class="track-info-row">
        <div
          class="track-cover cursor-pointer"
          role="button"
          tabindex="0"
          :aria-label="t('player.fullscreen')"
          @click="handleCoverClick"
          @keydown="handleCoverKeydown"
        >
          <img
            v-if="getArtworkUrl(currentTrack.artworkCacheKey) && !imgError"
            :src="getArtworkUrl(currentTrack.artworkCacheKey) ?? undefined"
            class="h-full w-full rounded-[inherit] object-cover"
            @error="imgError = true"
          />
          <div v-else class="flex h-full w-full items-center justify-center">
            <span class="i-lucide-music text-[var(--auralis-text-disabled)]"></span>
          </div>
        </div>
        <div class="track-text">
          <div class="track-title">{{ currentTrack.title || 'Unknown Title' }}</div>
          <div class="track-subtitle">
            {{ formatPlaybackSubtitle(currentTrack) }}
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
